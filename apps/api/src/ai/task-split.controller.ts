import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { Feature } from '@shipyard/db';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles, WRITER_ROLES } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { ChecklistService } from '../checklist/checklist.service';
import { ProjectsService } from '../projects/projects.service';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { AIUsageService } from './ai-usage.service';
import { SplitTaskDto } from './dto/split-task.dto';
import { RagSearchService } from './rag-search.service';
import { TaskSplitService } from './task-split.service';

/**
 * AI による ChecklistItem の分解 API(TASK_SPLIT、ADR-005、Day 15)。
 *
 * 既存の「大きめのタスク」(親 ChecklistItem)を Haiku 4.5 + Tool Use(`submit_subtasks`)で
 * 実行可能なサブタスクに分解し、Category は親から継承して `ChecklistService.bulkCreate` で追加する
 * (append-only、元タスクは変更しない)。
 *
 * 認証 → 所属解決 → 書き込み権限チェックは `ClerkAuthGuard` → `WorkspaceGuard`(`@Roles(...WRITER_ROLES)`)が担う。
 * リクエストボディの検証(任意 instructions ≤ 2000 文字)は `SplitTaskDto` + `ValidationPipe`。
 */
@Controller('workspaces/:slug/projects/:projectId/checklist')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class TaskSplitController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly checklist: ChecklistService,
    private readonly taskSplit: TaskSplitService,
    private readonly aiUsage: AIUsageService,
    private readonly ragSearch: RagSearchService,
  ) {}

  /**
   * POST /workspaces/:slug/projects/:projectId/checklist/:itemId/split
   * - 未所属 / slug・project・item 不在 → 404(存在の有無を漏らさない)
   * - DEVELOPER 未満のロール → 403(`WorkspaceGuard` + `@Roles`)
   * - Free プランの月次 AI 上限超過 → 403
   * - instructions が 2000 文字超 → 400(`SplitTaskDto`)
   *
   * 処理フロー:
   *   親 Project 取得(_count.checklist が必要なので getOwnedOrThrow)
   *   → 親 ChecklistItem 取得(404 防御、ChecklistService が内部で親 Project の存在も確認)
   *   → Free 上限チェック → RAG 検索(他プロジェクトを参考) → Haiku 4.5 でサブタスク生成
   *   → 親 Category 継承で `ChecklistService.bulkCreate`(末尾追加)
   *   → AIUsage を二段で記録(検索 embedding と本生成、別 record)
   *
   * 末尾追加(親の直後ではない): 親直後への挿入は既存項目の position シフトが必要で MVP では重い。
   * 元タスクは変更しない(append-only、ロールバック不要)。
   */
  @Post(':itemId/split')
  @Roles(...WRITER_ROLES)
  async split(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() dto: SplitTaskDto,
  ) {
    // `_count.checklist`(position 計算用、bulkCreate の baseOffset に使う)を得るために
    // projects.getOwnedOrThrow を呼ぶ必要がある。checklist.getOwnedOrThrow も内部で親 Project の存在を assertExists するが、こちらは count を持たないため、両方呼ぶ運用は意図したもの。
    const project = await this.projects.getOwnedOrThrow(ws.tenantId, projectId);
    const parent = await this.checklist.getOwnedOrThrow(ws.tenantId, projectId, itemId);

    // Free プランの月次 AI 上限チェック(超過なら 403)。AI を呼ぶ前に。
    await this.aiUsage.assertWithinPlanCredits({ id: ws.tenantId, plan: ws.plan });

    const instructions = dto.instructions?.trim() || undefined;

    // RAG: 過去ドキュメントを意味検索して prompt に注入(ADR-005 の独自性コア)。
    // クエリは「プロジェクト名 + 親タスク title + 親タスク description」で構成。自プロジェクトは除外。
    // 失敗してもメイン生成は止めない方針(RagSearchService 内部で握りつぶし → 空ヒット返す)。
    const searchQuery = [project.name, parent.title, parent.description ?? '']
      .filter((s) => s && s.trim())
      .join('\n');
    const rag = await this.ragSearch.searchSimilar(ws.tenantId, searchQuery, {
      excludeProjectId: project.id,
    });

    // RagSearchHit extends RagReference なので rag.hits をそのまま references に渡せる。
    const generated = await this.taskSplit.split({
      project: { name: project.name, description: project.description, status: project.status },
      parent: { title: parent.title, description: parent.description, category: parent.category },
      instructions,
      references: rag.hits,
    });

    // 親 Category を全サブタスクに継承し、parentId で親 ChecklistItem に紐付けて bulkCreate。
    // position は既存項目の最大値 + 1 から振り直す(末尾追加、親の直後ではない)。
    // parentId のおかげで「これは何々の分解結果」が DB 上で追跡可能(UI 階層表示・cascade 削除の根拠)。
    const existing = project._count?.checklist ?? 0;
    const items = await this.checklist.bulkCreate(
      ws.tenantId,
      project.id,
      generated.items.map((item) => ({
        category: parent.category,
        title: item.title,
        description: item.description,
      })),
      { baseOffset: existing, parentId: parent.id },
    );

    // AI 利用記録(課金・Free 上限判定の根拠なので取りこぼし禁止、ADR-005)。
    // 検索クエリの embedding と本生成は別 record(model が異なるため、単価計算が分岐する)。
    // OTHER は assertWithinPlanCredits の上限カウントから除外される(ai-usage.service.ts 参照)。
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
      feature: Feature.TASK_SPLIT,
      tokensIn: generated.tokensIn,
      tokensOut: generated.tokensOut,
    });

    return { items };
  }
}
