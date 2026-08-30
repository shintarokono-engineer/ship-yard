import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { Feature } from '@shipyard/db';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { ProjectsService } from '../projects/projects.service';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { AI_MODEL_SONNET, SESSION_SUMMARY_MAX_TURNS } from './ai.constants';
import { AIUsageService } from './ai-usage.service';
import { SummarizeSessionDto } from './dto/summarize-session.dto';
import { takeRecentWindow } from './rag-qa-transcript';
import { RagQaService } from './rag-qa.service';
import { SessionSummaryService } from './session-summary.service';

/**
 * 壁打ちセッションから `Project.description` の候補文を作る API。
 *
 * **DB は書き換えない**。生成結果をプレビューとして返すだけで、保存は
 * `PATCH /workspaces/:slug/projects/:projectId` が担う(`description` は履歴が無く、
 * 上書きすると戻せないため人の承認を挟む)。
 */
@Controller('workspaces/:slug/projects/:projectId/qa/sessions')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class SessionSummaryController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly ragQa: RagQaService,
    private readonly sessionSummary: SessionSummaryService,
    private readonly aiUsage: AIUsageService,
  ) {}

  /**
   * POST /workspaces/:slug/projects/:projectId/qa/sessions/:sessionId/summary
   * - 未所属 / project・session 不在 / 別プロジェクトの sessionId → 404
   * - DEVELOPER 未満のロール → 403
   * - FREE プラン / 月次クレジット上限超過 → 403
   * - メッセージが 1 件も無いセッション → 400
   *
   * 保存しなくてもクレジットは消費する。
   */
  @Post(':sessionId/summary')
  @Roles(...WRITER_ROLES)
  async summarize(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: SummarizeSessionDto,
  ) {
    const project = await this.projects.getContextOrThrow(ws.tenantId, projectId);

    // テナント越境・クロスプロジェクト参照のどちらも 404。
    await this.ragQa.assertSessionInProject(ws.tenantId, sessionId, projectId);

    // 1 ターン = 2 メッセージ。+1 件多く取り、COUNT 無しで切り捨ての有無を判定する。
    const limit = SESSION_SUMMARY_MAX_TURNS * 2;
    const rows = await this.ragQa.listRecentMessages(ws.tenantId, sessionId, limit + 1);
    const { messages, truncated: transcriptTruncated } = takeRecentWindow(rows, limit);
    if (messages.length === 0) {
      throw new BadRequestException(
        'このセッションにはまだ会話がありません。質問を送ってから実行してください。',
      );
    }

    const instructions = dto.instructions?.trim() || undefined;

    // クレジットを AI 呼び出しの前に原子的に予約する(TOCTOU 回避、ADR-012)。
    return this.aiUsage.withCreditReservation(
      { id: ws.tenantId, plan: ws.plan },
      { userId: ws.userId, model: AI_MODEL_SONNET, feature: Feature.DESCRIPTION_SYNC },
      async () => {
        const generated = await this.sessionSummary.generate({
          project: {
            name: project.name,
            description: project.description,
            status: project.status,
          },
          transcript: messages,
          instructions,
        });

        return {
          value: {
            description: generated.description,
            currentDescription: project.description ?? null,
            transcriptTruncated,
            descriptionTruncated: generated.truncated,
          },
          tokensIn: generated.tokensIn,
          tokensOut: generated.tokensOut,
        };
      },
    );
  }
}
