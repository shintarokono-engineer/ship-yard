import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { DocType, Feature, Role } from '@shipyard/db';

import type { AuthUser } from '../auth/auth-user';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipService } from '../workspaces/membership.service';
import { AIUsageService } from './ai-usage.service';
import { DraftGenService } from './draft-gen.service';

/** 生成リクエストのボディ */
interface GenerateBody {
  docType?: string;
  instructions?: string;
}

/** ドキュメント作成権限を持つロール(Role 定義: DEVELOPER 以上が ProjectDocument を作成編集可能)。 */
const WRITER_ROLES: ReadonlySet<Role> = new Set([Role.OWNER, Role.ADMIN, Role.DEVELOPER]);

/**
 * AI によるドキュメントドラフト生成 API(DRAFT_GEN、ADR-005)。
 *
 * 認証 → 所属チェック(`MembershipService`、path slug ベース)→ 書き込み権限チェック →
 * Free プランの月次 AI 上限チェック → Sonnet 4 + Tool Use で生成 → ProjectDocument 保存 → AIUsage 記録。
 */
@Controller('workspaces/:slug/projects/:projectId/documents')
@UseGuards(ClerkAuthGuard)
export class DraftGenController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly draftGen: DraftGenService,
    private readonly aiUsage: AIUsageService,
  ) {}

  /**
   * POST /workspaces/:slug/projects/:projectId/documents/generate
   * - 未所属 / slug・project 不在 → 404(存在の有無を漏らさない)
   * - DEVELOPER 未満のロール → 403
   * - Free プランの月次 AI 上限超過 → 403
   * - docType が README / LANDING_PAGE 以外 → 400
   */
  @Post('generate')
  async generate(
    @Param('slug') slug: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: GenerateBody,
  ) {
    const docType = body?.docType;
    if (docType !== DocType.README && docType !== DocType.LANDING_PAGE) {
      throw new BadRequestException(
        `docType must be "${DocType.README}" or "${DocType.LANDING_PAGE}"`,
      );
    }

    const access = await this.membership.resolveAccess(slug, user.clerkUserId);
    if (!access) throw new NotFoundException();
    if (!WRITER_ROLES.has(access.role)) {
      throw new ForbiddenException(
        'You do not have permission to create documents in this workspace',
      );
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: access.tenantId },
      select: { id: true, name: true, description: true, status: true },
    });
    if (!project) throw new NotFoundException();

    // Free プランの月次 AI 上限チェック(超過なら 403)。AI を呼ぶ前に。
    await this.aiUsage.assertWithinFreeQuota({ id: access.tenantId, plan: access.plan });

    const draft = await this.draftGen.generate({
      project: { name: project.name, description: project.description, status: project.status },
      kind: docType,
      instructions: body.instructions?.trim() || undefined,
    });

    // version は同一 type 内で v1, v2, ... と増加(schema コメント)
    const priorCount = await this.prisma.projectDocument.count({
      where: { tenantId: access.tenantId, projectId: project.id, type: docType },
    });

    const document = await this.prisma.projectDocument.create({
      data: {
        tenantId: access.tenantId,
        projectId: project.id,
        type: docType,
        title: draft.title,
        content: draft.content,
        version: priorCount + 1,
        // embedding は後続タスク(OpenAI text-embedding-3-small)で埋める
        createdById: access.userId,
      },
      select: { id: true, type: true, title: true, content: true, version: true, createdAt: true },
    });

    // AI 利用記録(課金・Free 上限判定の根拠なので取りこぼし禁止、ADR-005)
    await this.aiUsage.record({
      tenantId: access.tenantId,
      userId: access.userId,
      model: draft.model,
      feature: Feature.DRAFT_GEN,
      tokensIn: draft.tokensIn,
      tokensOut: draft.tokensOut,
    });

    return document;
  }
}
