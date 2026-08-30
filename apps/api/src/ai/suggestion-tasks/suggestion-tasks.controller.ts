import {
  Body,
  Controller,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Feature } from '@shipyard/db';

import { ClerkAuthGuard } from '../../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../../auth/roles';
import { WorkspaceGuard } from '../../auth/workspace.guard';
import { ChecklistService } from '../../checklist/checklist.service';
import { IdeaValidationService } from '../../idea-validation/idea-validation.service';
import { ProductDiagnosisService } from '../../product-diagnosis/product-diagnosis.service';
import { ProjectsService } from '../../projects/projects.service';
import type { WorkspaceAccess } from '../../workspaces/membership.service';
import { AI_MODEL_HAIKU, SUGGESTION_TASKS_EXISTING_TITLES_MAX } from '../shared/ai.constants';
import { AIUsageService } from '../shared/ai-usage.service';
import { excludeKnownTitles } from '../shared/checklist-items-tool';
import { CreateChecklistFromSuggestionsDto } from './dto/create-checklist-from-suggestions.dto';
import { pickSuggestions } from './suggestion-source';
import { SuggestionTasksService } from './suggestion-tasks.service';

/**
 * 改善提案から ChecklistItem を作る API(F17、ADR-013)。
 *
 * 診断 / 検証の結果に出た改善提案を、AI が実行可能なタスクへ分解して一括作成する。
 * 1 対 1 の転記ではなく分解にしているのは、1 つの提案が複数の領域(技術 / マーケ 等)に
 * 跨ることが普通にあり、転記だと `category` を 1 つしか選べないため(`suggestion-tasks.prompt.ts` 参照)。
 *
 * base path は `ChecklistGenController` / `TaskSplitController` と同じで、`ChecklistService.bulkCreate`
 * を共有しつつ Service / DTO / Tool は分ける、という既存の構成に倣っている。
 *
 * **`Feature.CHECKLIST_GEN` を再利用している**(専用の enum 値を足していない)。`Feature` は
 * クレジット会計の軸で、同じ Haiku・同じ 1cr・生成物も同じ `ChecklistItem` である以上、
 * 会計上の意味は CHECKLIST_GEN と同一だから。起点別の内訳が必要になったら後から
 * 追加型 migration で分離できる。enum の追加漏れではない。
 */
@Controller('workspaces/:slug/projects/:projectId/checklist')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class SuggestionTasksController {
  private readonly logger = new Logger(SuggestionTasksController.name);

  constructor(
    private readonly projects: ProjectsService,
    private readonly checklist: ChecklistService,
    private readonly suggestionTasks: SuggestionTasksService,
    private readonly aiUsage: AIUsageService,
    private readonly diagnosis: ProductDiagnosisService,
    private readonly validation: IdeaValidationService,
  ) {}

  /**
   * POST /workspaces/:slug/projects/:projectId/checklist/from-suggestions
   * - 未所属 / project・sourceId 不在 / 別プロジェクトの sourceId → 404(存在の有無を漏らさない)
   * - DEVELOPER 未満のロール → 403(`WorkspaceGuard` + `@Roles`)
   * - FREE プラン / 月次クレジット上限超過 → 403(`withCreditReservation`)
   * - index が範囲外 / 選択した提案が読み取れない → 400(`pickSuggestions`)
   *
   * 生成結果が既存項目とすべて重複した場合は `items: []` を返す(エラーにしない)。
   * AI 呼び出しは行われているのでクレジットは消費される。
   */
  @Post('from-suggestions')
  @Roles(...WRITER_ROLES)
  async fromSuggestions(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Body() dto: CreateChecklistFromSuggestionsDto,
  ) {
    const project = await this.projects.getOwnedOrThrow(ws.tenantId, projectId);

    // sourceId のテナント分離は getById が担う(他テナントの id は 404)。
    const row =
      dto.source === 'DIAGNOSIS'
        ? await this.diagnosis.getById(ws.tenantId, dto.sourceId)
        : await this.validation.getById(ws.tenantId, dto.sourceId);

    // 同テナントでも「別プロジェクトの診断結果」を混ぜられないようにする。
    if (row.projectId !== project.id) {
      throw new NotFoundException('診断結果が見つかりません');
    }

    const suggestions = pickSuggestions(row.suggestions, dto.indexes, dto.source);
    const instructions = dto.instructions?.trim() || undefined;

    // 重複生成を抑えるため既存項目の title を渡す。全件だとトークンを圧迫するので直近 N 件。
    const existingTitles = await this.checklist.listRecentTitles(
      ws.tenantId,
      project.id,
      SUGGESTION_TASKS_EXISTING_TITLES_MAX,
    );

    // クレジットを AI 呼び出しの「前」に原子的に予約する(TOCTOU 回避、ADR-012)。
    // 上限超過 / FREE は 403、AI 成功後に実トークンで確定、失敗時は自動で予約解放。
    return this.aiUsage.withCreditReservation(
      { id: ws.tenantId, plan: ws.plan },
      { userId: ws.userId, model: AI_MODEL_HAIKU, feature: Feature.CHECKLIST_GEN },
      async () => {
        const generated = await this.suggestionTasks.generate({
          project: {
            name: project.name,
            description: project.description,
            status: project.status,
          },
          suggestions,
          existingTitles,
          instructions,
        });

        // プロンプトで「既存と重複するな」と指示しているが、モデルの遵守は保証されない
        // (実測でも完全一致の重複が出た)。コードで確定的に落とせる制約をモデルに委ねない。
        // 突き合わせる範囲はプロンプトに渡したものと同一にする(渡していない古い項目まで
        // 弾くと、ユーザーから見て「なぜ消えたか」が説明できないため)。
        const fresh = excludeKnownTitles(generated.items, existingTitles);
        if (fresh.length < generated.items.length) {
          // 落とした件数はユーザーにもレスポンスにも出ないので、ログだけが唯一の観測点。
          // 常に落ちているようならプロンプト側の指示が効いていないサイン。
          this.logger.log(
            `from-suggestions: dropped ${generated.items.length - fresh.length} duplicate item(s) of ${generated.items.length}`,
          );
        }

        // 全件重複は AI の異常ではなく「もう十分タスク化されている」という正常な結果なので、
        // 502 にはせず空配列を返す。呼び出し側が件数 0 として扱う。
        const items = await this.checklist.bulkCreate(ws.tenantId, project.id, fresh, {
          baseOffset: project._count?.checklist ?? 0,
        });

        return {
          value: { items },
          tokensIn: generated.tokensIn,
          tokensOut: generated.tokensOut,
        };
      },
    );
  }
}
