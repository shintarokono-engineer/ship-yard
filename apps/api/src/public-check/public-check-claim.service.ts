import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { ProjectStatus } from '@shipyard/db';

import { dayjs } from '../common/time';
import { IdeaValidationService } from '../idea-validation/idea-validation.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  PUBLIC_CHECK_CLAIM_STALE_MINUTES,
  PUBLIC_CHECK_PROJECT_NAME_FALLBACK,
  PUBLIC_CHECK_PROJECT_NAME_MAX_CHARS,
  PUBLIC_CHECK_WORKSPACE_NAME,
} from './public-check.constants';

/** claim の結果。FE はこれを使って着地先を決める。 */
export interface PublicCheckClaimResult {
  /** 作成(または既存)ワークスペースの slug。 */
  workspaceSlug: string;
  /** 作成したプロジェクト ID。再引き換え(冪等パス)では null。 */
  projectId: string | null;
  /**
   * 起動した 5 軸フル診断のジョブ ID。
   * **クレジットが足りず診断を起動できなかった場合は null**(それでも着地はさせる)。
   */
  jobId: string | null;
  /** 既に引き換え済みだったか(claim ページの再読み込み)。 */
  alreadyClaimed: boolean;
}

/**
 * `/check` の結果を登録済みアカウントへ持ち越す処理(ADR-015)。
 *
 * 引き換えの権限は結果 ID(推測不能値)そのもので、短命トークンは持たない。
 * 二重引き換えは `claimedAt` を原子的に取ることで防ぐ。
 */
@Injectable()
export class PublicCheckClaimService {
  private readonly logger = new Logger(PublicCheckClaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
    private readonly projects: ProjectsService,
    private readonly ideaValidation: IdeaValidationService,
  ) {}

  async claim(clerkUserId: string, checkId: string): Promise<PublicCheckClaimResult> {
    const check = await this.prisma.publicIdeaCheck.findUnique({ where: { id: checkId } });
    if (!check) {
      throw new NotFoundException('診断結果が見つかりません。');
    }

    // 1. 引き換え権を原子的に取る。**ワークスペース作成より前に取る**こと
    //    (後だと連打や二重タブで 2 つのワークスペースが作られる)。
    //    テナント未記録のまま古くなった claim は途中で落ちたものなので取り直せる。
    const staleBefore = dayjs.utc().subtract(PUBLIC_CHECK_CLAIM_STALE_MINUTES, 'minute').toDate();
    const acquired = await this.prisma.publicIdeaCheck.updateMany({
      where: {
        id: checkId,
        OR: [{ claimedAt: null }, { claimedByTenantId: null, claimedAt: { lt: staleBefore } }],
      },
      data: { claimedAt: new Date() },
    });
    if (acquired.count === 0) {
      return this.resolveAlreadyClaimed(clerkUserId, checkId);
    }

    try {
      // 2. ワークスペースを自動作成する。名前だけ決めて slug は自動導出させる。
      //    Stripe の 7 日 Pro トライアル初期化も既存経路に乗る。
      const created = await this.workspaces.create(clerkUserId, {
        name: PUBLIC_CHECK_WORKSPACE_NAME,
      });
      const tenantId = created.tenant.id;

      // `Project.createdById` は内部 User ID(Clerk の ID ではない)。
      // `workspaces.create` が User 行の存在を保証済みなので、ここでは引くだけでよい。
      const user = await this.prisma.user.findUnique({
        where: { clerkUserId },
        select: { id: true },
      });
      if (!user) {
        throw new NotFoundException('ユーザー情報が見つかりません。');
      }

      // 3. アイデア文から Project(status = IDEA)を作る。有料版の検証は `description` を
      //    読むため、ここに入れておけばフル診断が成立する。
      const project = await this.projects.create(tenantId, user.id, {
        name: buildProjectName(check.ideaText),
        description: check.ideaText,
        status: ProjectStatus.IDEA,
      });

      // 4. 5 軸フル診断を起動する。失敗は握りつぶす。Stripe がダウンしているとトライアル
      //    初期化が失敗して `plan` が FREE(上限 0cr)のままになり 403 になるが、
      //    プロジェクトは既に出来ているので**失敗で着地させない**。
      const tenant = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { plan: true },
      });
      let jobId: string | null = null;
      try {
        const started = await this.ideaValidation.startValidation({
          tenantId,
          projectId: project.id,
          userId: user.id,
          plan: tenant.plan,
        });
        jobId = started.jobId;
      } catch (err) {
        this.logger.warn(
          `PUBLIC_CHECK_CLAIM_VALIDATION_SKIPPED tenantId=${tenantId} projectId=${project.id} plan=${tenant.plan}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      // 5. どのテナントが引き換えたかを記録する。撤退条件の「転換」判定にそのまま使う。
      await this.prisma.publicIdeaCheck.update({
        where: { id: checkId },
        data: { claimedByTenantId: tenantId },
      });

      return {
        workspaceSlug: created.tenant.slug,
        projectId: project.id,
        jobId,
        alreadyClaimed: false,
      };
    } catch (err) {
      // 引き換え権を解放する。戻さないと、失敗した結果が二度と引き換えられなくなる。
      await this.prisma.publicIdeaCheck.updateMany({
        where: { id: checkId, claimedByTenantId: null },
        data: { claimedAt: null },
      });
      throw err;
    }
  }

  /**
   * 既に引き換え済みだった場合の着地先を決める。
   *
   * 引き換え先のテナントに現在のユーザーが所属していれば本人の再訪なのでワークスペースへ送る
   * (リロードやブラウザバックを 409 にしない)。所属していなければ他人の結果なので 409。
   */
  private async resolveAlreadyClaimed(
    clerkUserId: string,
    checkId: string,
  ): Promise<PublicCheckClaimResult> {
    const check = await this.prisma.publicIdeaCheck.findUniqueOrThrow({
      where: { id: checkId },
      select: { claimedByTenantId: true },
    });

    if (check.claimedByTenantId) {
      const tenant = await this.prisma.tenant.findFirst({
        where: {
          id: check.claimedByTenantId,
          members: { some: { user: { clerkUserId } } },
        },
        select: { slug: true },
      });
      if (tenant) {
        return {
          workspaceSlug: tenant.slug,
          projectId: null,
          jobId: null,
          alreadyClaimed: true,
        };
      }
    }

    throw new ConflictException('この診断結果は既に別のアカウントで引き換えられています。');
  }
}

/** アイデア文の 1 行目からプロジェクト名を作る。名前は後から変えられるので AI は使わない。 */
function buildProjectName(ideaText: string): string {
  const firstLine = ideaText.split('\n')[0]?.trim() ?? '';
  const trimmed = firstLine.slice(0, PUBLIC_CHECK_PROJECT_NAME_MAX_CHARS).trim();
  return trimmed || PUBLIC_CHECK_PROJECT_NAME_FALLBACK;
}
