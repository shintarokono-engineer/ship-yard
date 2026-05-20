import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';

import { Feature } from '@shipyard/db';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { ProjectsService } from '../projects/projects.service';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { AIUsageService } from './ai-usage.service';
import { AskRagQaDto } from './dto/ask-rag-qa.dto';
import { CreateRagQaSessionDto } from './dto/create-rag-qa-session.dto';
import { RagQaService } from './rag-qa.service';
import { RagSearchService } from './rag-search.service';

/**
 * RAG_QA(プロジェクト壁打ち)API(ADR-005 Day 27 改訂、§9.4 で MVP 必須化)。
 *
 * 認可マトリクス:
 * - GET 系(セッション一覧 / 詳細):全テナントメンバー可(`@Roles()` 未指定)
 * - POST 系(セッション作成 / 質問送信):WRITER_ROLES(OWNER / ADMIN / DEVELOPER)のみ
 *
 * 質問送信フロー:
 * 1. プロジェクト存在確認(テナント越境 → 404)
 * 2. Free プラン月次 AI 上限チェック(超過 → 403)
 * 3. RAG 検索(直近質問をクエリに、自テナント + SEED_PUBLIC、ADR-008)
 * 4. `RagQaService.ask`(過去履歴 N=10 ターン + 参考 + system prompt で Sonnet 4 呼び出し)
 * 5. AIUsage 記録(検索 embedding + 本生成の 2 件)
 */
@Controller('workspaces/:slug/projects/:projectId/qa/sessions')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class RagQaController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly ragQa: RagQaService,
    private readonly aiUsage: AIUsageService,
    private readonly ragSearch: RagSearchService,
  ) {}

  /** GET /workspaces/:slug/projects/:projectId/qa/sessions — セッション一覧(新しい順)。 */
  @Get()
  async list(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
  ) {
    await this.projects.assertExists(ws.tenantId, projectId);
    return this.ragQa.listSessions(ws.tenantId, projectId);
  }

  /** POST /workspaces/:slug/projects/:projectId/qa/sessions — 新規セッション作成。 */
  @Post()
  @Roles(...WRITER_ROLES)
  async create(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: CreateRagQaSessionDto,
  ) {
    await this.projects.assertExists(ws.tenantId, projectId);
    return this.ragQa.createSession({
      tenantId: ws.tenantId,
      projectId,
      userId: ws.userId,
      title: dto.title,
    });
  }

  /** GET /workspaces/:slug/projects/:projectId/qa/sessions/:sessionId — セッション詳細 + メッセージ履歴。 */
  @Get(':sessionId')
  async getDetail(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('sessionId') sessionId: string,
  ) {
    await this.projects.assertExists(ws.tenantId, projectId);
    const result = await this.ragQa.getSessionWithMessages(ws.tenantId, sessionId);
    if (!result || result.session.projectId !== projectId) {
      // session の projectId が path の projectId と一致しない = テナント越境ではないがクロスプロジェクト参照禁止
      throw new NotFoundException();
    }
    return result;
  }

  /**
   * POST /workspaces/:slug/projects/:projectId/qa/sessions/:sessionId/messages
   * — 質問送信 → Sonnet 4 で回答 → user + assistant メッセージを永続化 → 戻り値で両方返す。
   */
  @Post(':sessionId/messages')
  @Roles(...WRITER_ROLES)
  async ask(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: AskRagQaDto,
  ) {
    const project = await this.projects.getOwnedOrThrow(ws.tenantId, projectId);

    // セッション存在 + プロジェクト整合性確認(クロスプロジェクト参照禁止、軽量 select)。
    // `ask` 内では既に直近 N ターンの履歴取得を行うため、ここで messages 全件取得すると 2 重ロードになる。
    await this.ragQa.assertSessionInProject(ws.tenantId, sessionId, projectId);

    // Free プラン月次 AI 上限チェック(質問は明示的な機能呼び出しなのでカウント対象、ADR-005)
    await this.aiUsage.assertWithinFreeQuota({ id: ws.tenantId, plan: ws.plan });

    // RAG 検索(直近質問 + プロジェクト名 + 概要をクエリに、ADR-008 で seed テナントも対象)
    const searchQuery = [dto.question, project.name, project.description ?? '']
      .filter((s) => s && s.trim())
      .join('\n');
    const rag = await this.ragSearch.searchSimilar(ws.tenantId, searchQuery, {
      excludeProjectId: project.id,
    });

    const result = await this.ragQa.ask({
      tenantId: ws.tenantId,
      sessionId,
      question: dto.question,
      project: {
        name: project.name,
        description: project.description,
        status: project.status,
      },
      references: rag.hits,
    });

    // AIUsage 記録(検索 embedding は Feature.OTHER、本生成は Feature.RAG_QA、ADR-005)
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
      model: result.model,
      feature: Feature.RAG_QA,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });

    // references は assistantMessage.references に永続化済み(GET 履歴でも同じ形で返る)。
    // トップレベルには載せず、フロントは常に message.references を参照する。
    return {
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
    };
  }
}
