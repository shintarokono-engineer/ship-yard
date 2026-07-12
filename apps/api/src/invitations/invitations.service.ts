import { createHash, randomBytes } from 'crypto';

import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { Role } from '@shipyard/db';

import { BillingService } from '../billing/billing.service';
import { dayjs } from '../common/time';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateInvitationDto } from './dto/create-invitation.dto';
import {
  INVITATION_TOKEN_BYTES,
  INVITATION_VALIDITY_DAYS,
  InvitationStatus,
} from './invitations.constants';

/** ロールの日本語ラベル(メール本文 + 詳細 API の `roleLabel` 用、現状 invitations 内に閉じている)。 */
const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'オーナー',
  ADMIN: '管理者',
  DEVELOPER: '開発者',
  REVIEWER: 'レビュワー',
  TESTER: 'テスター',
  VIEWER: '閲覧者',
};

interface InvitationStatusInput {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}

/**
 * 招待トークンを SHA-256 でハッシュ化して DB 照合用の値にする。
 *
 * 生トークン(URL に埋め込む値)は DB に保存せず、本ハッシュのみを `InvitationToken.token` に格納する。
 * これにより DB 漏洩時にトークンからの直接なりすまし(パスワードリセットトークン相当の資産)を防ぐ。
 * 生トークンは暗号学的乱数(高エントロピー)なので、salt 無しの単純ハッシュで十分(総当たり不能)。
 */
function hashInvitationToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** 4 状態を一意に決定する(優先順: REVOKED > ACCEPTED > EXPIRED > PENDING)。 */
function computeInvitationStatus(
  row: InvitationStatusInput,
  now: Date = new Date(),
): InvitationStatus {
  if (row.revokedAt) return InvitationStatus.REVOKED;
  if (row.acceptedAt) return InvitationStatus.ACCEPTED;
  if (row.expiresAt.getTime() < now.getTime()) return InvitationStatus.EXPIRED;
  return InvitationStatus.PENDING;
}

/** `InvitationsService.create` / `resend` の戻り値(レスポンスにそのまま流せる)。 */
export interface CreateInvitationResult {
  invitation: {
    id: string;
    email: string;
    role: Role;
    expiresAt: Date;
  };
  /** メール送信成功フラグ(false なら呼び出し側 UI で「メール送信失敗、再送が必要」と表示)。 */
  mailSent: boolean;
  /** メール送信失敗時の理由(運用切り分け用、ユーザーには露出しない方が良いが MVP では含める)。 */
  mailError?: string;
}

/** `InvitationsService.accept` の戻り値(承諾後、フロントが /w/{slug} に遷移するため slug を返す)。 */
export interface AcceptInvitationResult {
  tenantId: string;
  workspaceSlug: string;
  workspaceName: string;
  role: Role;
}

/** `InvitationsService.findDetail` の戻り値(GET /invitations/:token、未認証可)。 */
export interface InvitationDetail {
  email: string;
  role: Role;
  roleLabel: string;
  workspaceName: string;
  workspaceSlug: string;
  inviterName: string;
  expiresAt: Date;
  status: InvitationStatus;
}

/** `InvitationsService.list` の戻り値要素(GET /workspaces/:slug/invitations)。 */
export interface InvitationListItem {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedBy: { id: string; name: string | null; email: string };
  status: InvitationStatus;
}

/**
 * メンバー招待(ADR-007)の作成 / 承諾 / 詳細表示 / 一覧 / 取り消し / 再送。
 *
 * **作成(create)**:
 * 1. 招待トークンを暗号学的乱数で生成
 * 2. `InvitationToken` を INSERT(単一クエリ、トランザクションなし。理由は (3) で外部 I/O を呼ぶため)
 * 3. メール送信は `try/catch` で **ベストエフォート**(ADR-007、PostgreSQL アンチパターン回避):
 *    - トランザクション内で外部 I/O(Resend HTTP API)を待つとコネクションプールを長時間占有 → 他 API ブロック
 *    - 招待トークン作成 自体は成功させ、メール失敗時は `mailSent: false` をレスポンスに含める
 *    - 招待者は管理画面の再送(`resend`)で拾える
 *
 * **承諾(accept)**:
 * 1. token で `InvitationToken` を取得(404 if 未存在)
 * 2. 取り消し済み / 期限切れ → 410 Gone、受諾済み → 409 Conflict、email 不一致 → 403 Forbidden
 * 3. トランザクションで `TenantMember` を upsert(既に他ロールで所属なら上書き)+ `acceptedAt` を更新
 *    - upsert 内は DB クエリのみで外部 I/O なし、安全にトランザクション化可能
 *
 * **詳細(findDetail、未認証可)**:
 * - token から workspaceName / inviterName / roleLabel / status を返す(サインアップ前の確認用)
 * - 期限切れ・取り消し済みでも 200 で詳細 + status を返し、フロント側で表示分岐
 * - 不在のみ 404(token 推測攻撃に対しても 404 のみ返す)
 *
 * **取り消し(revoke)**:
 * - revokedAt をセットする論理削除(履歴を残す)
 * - 受諾済み → 409 / 取り消し済み → 409 / 未存在 or 別テナント → 404
 *
 * **再送(resend)**:
 * - 既存 token を `revokedAt = NOW()` で invalidate し、新 token を INSERT してメール送信
 *   - 古いメールリンクが使えなくなる(セキュリティ向上)
 *   - 期限切れの招待も「再送 = 期限延長 + token 更新」として扱える
 * - 受諾済み → 409 / 取り消し済み → 409 / 未存在 or 別テナント → 404
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly billing: BillingService,
  ) {}

  async create(
    tenantId: string,
    workspaceName: string,
    inviterUserId: string,
    dto: CreateInvitationDto,
  ): Promise<CreateInvitationResult> {
    const inviter = await this.requireUser(inviterUserId);

    // 生トークンはメールリンク用にのみ使い、DB にはハッシュを保存する。
    const rawToken = randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
    const expiresAt = dayjs.utc().add(INVITATION_VALIDITY_DAYS, 'day').toDate();

    const invitation = await this.prisma.invitationToken.create({
      data: {
        tenantId,
        email: dto.email,
        role: dto.role,
        token: hashInvitationToken(rawToken),
        expiresAt,
        invitedById: inviterUserId,
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    return this.sendAndWrap(invitation, rawToken, workspaceName, dto.email, dto.role, inviter);
  }

  async accept(token: string, clerkUserId: string): Promise<AcceptInvitationResult> {
    // §9.10 Clerk webhook(Day 49):`deletedAt` セット済(論理削除)ユーザーは招待受諾も不可。
    // `findFirst` で `clerkUserId` + `deletedAt: null` の AND 条件を使う。
    const user = await this.prisma.user.findFirst({
      where: { clerkUserId, deletedAt: null },
      select: { id: true, email: true },
    });
    if (!user) {
      // Clerk JWT は通っているが User テーブルに同期されていない or 論理削除済みのケース。
      // Webhook 未到達時の JIT は workspace 作成側でのみ実施するため、招待承諾側は 403 にする。
      throw new ForbiddenException('User not registered in Shipyard');
    }

    const invitation = await this.prisma.invitationToken.findUnique({
      where: { token: hashInvitationToken(token) },
      select: {
        id: true,
        tenantId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        tenant: { select: { slug: true, name: true } },
      },
    });
    if (!invitation) throw new NotFoundException();

    // 判定順は computeInvitationStatus の優先順(REVOKED > ACCEPTED > EXPIRED)に揃える。
    // 受諾済み招待は expiresAt が過去でも 409(既に受諾済み)を返すべきで、先に expired を見ると 410 に誤判定する。
    if (invitation.revokedAt) {
      throw new GoneException('Invitation has been revoked. Ask the inviter to send a new one.');
    }

    if (invitation.acceptedAt) {
      throw new ConflictException('Invitation has already been accepted.');
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Invitation has expired. Ask the inviter to resend.');
    }

    // 招待先 email と承諾ユーザーの email が一致するかを検証(ケース insensitive)
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('This invitation is for a different email address.');
    }

    await this.prisma.$transaction([
      this.prisma.tenantMember.upsert({
        where: { tenantId_userId: { tenantId: invitation.tenantId, userId: user.id } },
        // 既存メンバーがいない場合は招待ロールで作成
        create: { tenantId: invitation.tenantId, userId: user.id, role: invitation.role },
        // 既存メンバーがいる場合は招待ロールで上書き(MVP では単純化、降格防止は将来検討)
        update: { role: invitation.role },
      }),
      this.prisma.invitationToken.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    // ADR-012 第 1 層 Saga:DB commit 後に Stripe Subscription Quantity を新 seat 数に同期。
    // 失敗してもユーザー操作は成功扱い(第 3 層 reconciliation バッチが翌日に補正、v1.x)。
    try {
      await this.billing.syncSubscriptionQuantity(invitation.tenantId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `Stripe seat sync failed after invitation accept (tenant=${invitation.tenantId}): ${msg}`,
      );
    }

    return {
      tenantId: invitation.tenantId,
      workspaceSlug: invitation.tenant.slug,
      workspaceName: invitation.tenant.name,
      role: invitation.role,
    };
  }

  /** GET /invitations/:token(未認証可)。期限切れ・取り消し済みも詳細を返し、status で弁別する。 */
  async findDetail(token: string): Promise<InvitationDetail> {
    const invitation = await this.prisma.invitationToken.findUnique({
      where: { token: hashInvitationToken(token) },
      select: {
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        tenant: { select: { name: true, slug: true } },
        invitedBy: { select: { name: true, email: true } },
      },
    });
    if (!invitation) throw new NotFoundException();

    const inviterName = invitation.invitedBy.name?.trim() || invitation.invitedBy.email;

    return {
      email: invitation.email,
      role: invitation.role,
      roleLabel: ROLE_LABELS[invitation.role],
      workspaceName: invitation.tenant.name,
      workspaceSlug: invitation.tenant.slug,
      inviterName,
      expiresAt: invitation.expiresAt,
      status: computeInvitationStatus(invitation),
    };
  }

  /** GET /workspaces/:slug/invitations(OWNER/ADMIN)。ステータス計算込みで全件返す。 */
  async list(tenantId: string): Promise<InvitationListItem[]> {
    const rows = await this.prisma.invitationToken.findMany({
      where: { tenantId },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        invitedBy: { select: { id: true, name: true, email: true } },
      },
    });

    const now = new Date();
    return rows.map((r) => ({
      ...r,
      status: computeInvitationStatus(r, now),
    }));
  }

  /** DELETE /workspaces/:slug/invitations/:id(OWNER/ADMIN)。論理削除(revokedAt セット)。 */
  async revoke(tenantId: string, invitationId: string): Promise<{ id: string; revokedAt: Date }> {
    const invitation = await this.prisma.invitationToken.findFirst({
      where: { id: invitationId, tenantId },
      select: { id: true, acceptedAt: true, revokedAt: true },
    });
    if (!invitation) throw new NotFoundException();

    if (invitation.acceptedAt) {
      throw new ConflictException('Cannot revoke an already-accepted invitation.');
    }
    if (invitation.revokedAt) {
      throw new ConflictException('Invitation has already been revoked.');
    }

    const updated = await this.prisma.invitationToken.update({
      where: { id: invitation.id },
      data: { revokedAt: new Date() },
      select: { id: true, revokedAt: true },
    });
    if (!updated.revokedAt) {
      // 直前に non-null 値で UPDATE したので到達不能。Prisma の型は nullable のままなので明示的に narrow。
      throw new InternalServerErrorException('revokedAt unexpectedly null after update');
    }
    return { id: updated.id, revokedAt: updated.revokedAt };
  }

  /**
   * POST /workspaces/:slug/invitations/:id/resend(OWNER/ADMIN)。
   * 既存招待を revoke し、新 token + 新 expiresAt(現在から 7 日)で再発行 + メール送信。
   */
  async resend(
    tenantId: string,
    invitationId: string,
    workspaceName: string,
    actorUserId: string,
  ): Promise<CreateInvitationResult> {
    const inviter = await this.requireUser(actorUserId);

    const existing = await this.prisma.invitationToken.findFirst({
      where: { id: invitationId, tenantId },
      select: { id: true, email: true, role: true, acceptedAt: true, revokedAt: true },
    });
    if (!existing) throw new NotFoundException();

    if (existing.acceptedAt) {
      throw new ConflictException('Cannot resend an already-accepted invitation.');
    }
    if (existing.revokedAt) {
      throw new ConflictException('Cannot resend a revoked invitation. Create a new one instead.');
    }

    const rawToken = randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
    const expiresAt = dayjs.utc().add(INVITATION_VALIDITY_DAYS, 'day').toDate();

    // 既存を revoke + 新規発行をトランザクション化(両方 DB クエリのみ、外部 I/O なし)
    const [, invitation] = await this.prisma.$transaction([
      this.prisma.invitationToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.invitationToken.create({
        data: {
          tenantId,
          email: existing.email,
          role: existing.role,
          token: hashInvitationToken(rawToken),
          expiresAt,
          invitedById: actorUserId,
        },
        select: { id: true, email: true, role: true, expiresAt: true },
      }),
    ]);

    return this.sendAndWrap(
      invitation,
      rawToken,
      workspaceName,
      existing.email,
      existing.role,
      inviter,
    );
  }

  /** User 取得 + 不在時 500(membership 解決済みなので通常到達不能)。 */
  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) {
      throw new InternalServerErrorException('Inviter User row not found');
    }
    return user;
  }

  /** メール送信(ベストエフォート) + レスポンス形に整形。create / resend で共有。 */
  private async sendAndWrap(
    invitation: { id: string; email: string; role: Role; expiresAt: Date },
    token: string,
    workspaceName: string,
    to: string,
    role: Role,
    inviter: { name: string | null; email: string },
  ): Promise<CreateInvitationResult> {
    const inviterName = inviter.name?.trim() || inviter.email;
    try {
      await this.mail.sendInvitation({
        to,
        token,
        workspaceName,
        inviterName,
        roleLabel: `${ROLE_LABELS[role]}(${role})`,
        expiresAt: invitation.expiresAt,
      });
      return { invitation, mailSent: true };
    } catch (e) {
      const mailError = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to send invitation email to ${to}: ${mailError}`);
      return { invitation, mailSent: false, mailError };
    }
  }
}
