import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { Feature } from '@shipyard/db';

import { AIUsageService } from '../ai/ai-usage.service';
import { RagSearchService } from '../ai/rag-search.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { ProjectsService } from '../projects/projects.service';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { GenerateLandingPageDto } from './dto/generate-landing-page.dto';
import { PublishLandingPageDto } from './dto/publish-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { LandingPageService } from './landing-page.service';
import { parseLpBlocks, parseLpTheme } from './lp-blocks';
import { LpGenService } from './lp-gen.service';

/**
 * ランディングページ(LP)のブロック生成 API(ADR-009、Day 30)。
 *
 * Day 7 の DRAFT_GEN(LP を Markdown で `ProjectDocument` に生成)に代わり、LP を
 * Sonnet 4 + Tool Use(`submit_landing_page`)で **ブロック構造** で生成し、`LandingPage`
 * テーブルに upsert する。1 プロジェクト = 1 LP のため再生成は既存 LP の上書き。
 *
 * 認証 → 所属解決 → 書き込み権限チェックは `ClerkAuthGuard` → `WorkspaceGuard`(`@Roles(...WRITER_ROLES)`)が担う。
 */
@Controller('workspaces/:slug/projects/:projectId/landing-page')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class LandingPageController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly landingPage: LandingPageService,
    private readonly lpGen: LpGenService,
    private readonly aiUsage: AIUsageService,
    private readonly ragSearch: RagSearchService,
  ) {}

  /**
   * GET /workspaces/:slug/projects/:projectId/landing-page
   * - 未所属 / slug・project 不在 → 404
   * - LP 未生成 → 404(プロジェクトは存在するが LP がまだ無い状態)
   *
   * 閲覧のみなので `@Roles` は付けず全テナントメンバーが参照可(プレビュー UI 用、Day 31)。
   */
  @Get()
  async get(@CurrentWorkspace() ws: WorkspaceAccess, @Param('projectId') projectId: string) {
    await this.projects.getOwnedOrThrow(ws.tenantId, projectId);
    const landingPage = await this.landingPage.findByProject(ws.tenantId, projectId);
    if (!landingPage) {
      throw new NotFoundException('このプロジェクトのランディングページはまだ生成されていません。');
    }
    return landingPage;
  }

  /**
   * PUT /workspaces/:slug/projects/:projectId/landing-page
   * - 未所属 / slug・project 不在 → 404
   * - LP 未生成 → 404(生成前のプロジェクトは編集できない)
   * - DEVELOPER 未満のロール → 403(`WorkspaceGuard` + `@Roles`)
   * - blocks が配列でない → 400(`UpdateLandingPageDto`)
   * - blocks の正規化結果が空 → 400(最低 1 ブロック必須)
   *
   * 編集 UI(Day 32)からの保存。受け取った blocks は `parseLpBlocks` で正規化・検証し、
   * 既存 LP の `blocks` を上書きする(AI 呼び出しなし、`publishedAt` は変更しない)。
   */
  @Put()
  @Roles(...WRITER_ROLES)
  async update(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateLandingPageDto,
  ) {
    await this.projects.getOwnedOrThrow(ws.tenantId, projectId);

    const blocks = parseLpBlocks(dto.blocks);
    if (blocks.length === 0) {
      throw new BadRequestException('ランディングページには最低 1 ブロックが必要です。');
    }
    const theme = parseLpTheme(dto.theme);

    const updated = await this.landingPage.updateContent(ws.tenantId, projectId, blocks, theme);
    if (!updated) {
      throw new NotFoundException('このプロジェクトのランディングページはまだ生成されていません。');
    }
    return updated;
  }

  /**
   * PATCH /workspaces/:slug/projects/:projectId/landing-page/publish
   * - 未所属 / slug・project 不在 → 404
   * - LP 未生成 → 404
   * - DEVELOPER 未満のロール → 403(`WorkspaceGuard` + `@Roles`)
   * - published が boolean でない → 400(`PublishLandingPageDto`)
   *
   * LP の公開状態を切り替える(Day 33)。`published=true` で公開 URL `/p/{slug}/{projectId}` から
   * 未認証でも閲覧可能になる。
   */
  @Patch('publish')
  @Roles(...WRITER_ROLES)
  async setPublished(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: PublishLandingPageDto,
  ) {
    await this.projects.getOwnedOrThrow(ws.tenantId, projectId);

    const updated = await this.landingPage.setPublished(ws.tenantId, projectId, dto.published);
    if (!updated) {
      throw new NotFoundException('このプロジェクトのランディングページはまだ生成されていません。');
    }
    return updated;
  }

  /**
   * POST /workspaces/:slug/projects/:projectId/landing-page/generate
   * - 未所属 / slug・project 不在 → 404
   * - DEVELOPER 未満のロール → 403(`WorkspaceGuard` + `@Roles`)
   * - Free プランの月次 AI 上限超過 → 403
   * - instructions が 2000 文字超 → 400(`GenerateLandingPageDto`)
   *
   * 処理フロー:親 Project 取得 → Free 上限チェック → RAG 検索 → Sonnet 4 でブロック生成
   * → `LandingPage` に upsert → AIUsage を二段で記録。
   */
  @Post('generate')
  @Roles(...WRITER_ROLES)
  async generate(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: GenerateLandingPageDto,
  ) {
    const project = await this.projects.getOwnedOrThrow(ws.tenantId, projectId);

    // Free プランの月次 AI 上限チェック(超過なら 403)。AI を呼ぶ前に。
    await this.aiUsage.assertWithinFreeQuota({ id: ws.tenantId, plan: ws.plan });

    const instructions = dto.instructions?.trim() || undefined;

    // RAG: 過去ドキュメントを意味検索して prompt に注入(ADR-005)。自プロジェクトは除外。
    // 失敗してもメイン生成は止めない(RagSearchService 内部で握りつぶし)。
    const searchQuery = [project.name, project.description ?? '', instructions ?? '']
      .filter((s) => s && s.trim())
      .join('\n');
    const rag = await this.ragSearch.searchSimilar(ws.tenantId, searchQuery, {
      excludeProjectId: project.id,
    });

    const generated = await this.lpGen.generate({
      project: { name: project.name, description: project.description, status: project.status },
      instructions,
      references: rag.hits,
    });

    const landingPage = await this.landingPage.saveGenerated(
      ws.tenantId,
      project.id,
      generated.blocks,
    );

    // AI 利用記録(課金・Free 上限判定の根拠なので取りこぼし禁止、ADR-005)。
    // LP 生成は ADR-005 の DRAFT_GEN 定義(README / LP / 告知文)に含まれるため Feature.DRAFT_GEN。
    if (rag.tokensIn > 0) {
      await this.aiUsage.record({
        tenantId: ws.tenantId,
        userId: ws.userId,
        model: rag.model,
        feature: Feature.OTHER,
        tokensIn: rag.tokensIn,
        tokensOut: 0,
      });
    }
    await this.aiUsage.record({
      tenantId: ws.tenantId,
      userId: ws.userId,
      model: generated.model,
      feature: Feature.DRAFT_GEN,
      tokensIn: generated.tokensIn,
      tokensOut: generated.tokensOut,
    });

    return landingPage;
  }
}
