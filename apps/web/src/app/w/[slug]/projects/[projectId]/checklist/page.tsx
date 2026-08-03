import { notFound } from 'next/navigation';

import {
  CATEGORIES,
  CATEGORY_META,
  isWriterRole,
  type Category,
  type ChecklistItem,
} from '@/lib/api/types';
import { InlineEmpty } from '@/components/inline-empty';
import { ProjectBreadcrumbs } from '@/components/project-breadcrumbs';
import { EMPTY_MESSAGES } from '@/lib/empty-messages';
import { featurePageDescription, PROJECT_FEATURE_META } from '@/lib/project-features';
import { fetchProject, fetchUsage, fetchWorkspace, listChecklist } from '@/lib/api/workspaces';

import { ChecklistItemRow } from './_components/checklist-item-row';
import { GenerateChecklistDialog } from './_components/generate-checklist-dialog';
import { InlineAddForm } from './_components/inline-add-form';
import { SplitTaskDialog } from './_components/split-task-dialog';
import { SubtaskAddSlot } from './_components/subtask-add-slot';

/**
 * `/w/{slug}/projects/{projectId}/checklist` — チェックリスト一覧。
 *
 * カテゴリ別の `<details>` セクションを縦に並べ、各セクション内で position 順に親→サブ階層表示。
 * 折りたたみ状態はブラウザネイティブ挙動を活かす(SSR 初期表示は全カテゴリ展開)。
 * AI 一括生成はヘッダの「AI で一括生成」ボタンから(タスク分解は Day 23 で追加予定)。
 */
export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  // workspace / project はどちらも route params のみで引け 404 で null を返すため並列化する。
  // items / usage は project 不在時に 404 を throw するので、notFound ガード後にまとめて取得する。
  const [workspace, project] = await Promise.all([
    fetchWorkspace(slug),
    fetchProject(slug, projectId),
  ]);
  if (!workspace) notFound();
  if (!project) notFound();

  const [items, usage] = await Promise.all([listChecklist(slug, projectId), fetchUsage(slug)]);
  const canWrite = isWriterRole(workspace.role);
  const grouped = groupByCategory(items);

  return (
    <div className="space-y-6 cursor-default">
      <div className="space-y-2">
        <ProjectBreadcrumbs workspace={workspace} project={project} feature="CHECKLIST" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{PROJECT_FEATURE_META.CHECKLIST.label}</h1>
            <p className="text-muted-foreground text-sm">{featurePageDescription('CHECKLIST')}</p>
          </div>
          {canWrite && <GenerateChecklistDialog slug={slug} projectId={projectId} usage={usage} />}
        </div>
      </div>

      <div className="space-y-3">
        {CATEGORIES.map((category) => {
          const group = grouped[category];
          const totalCount = group.parents.length + group.subtasks.size;
          const doneCount = countDone(group);
          return (
            <details key={category} open className="group rounded-lg border">
              <summary className="hover:bg-accent/30 flex cursor-pointer items-center justify-between gap-2 rounded-t-lg px-4 py-3 transition-colors [&::-webkit-details-marker]:hidden">
                <span className="font-medium">{CATEGORY_META[category].label}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {doneCount} / {totalCount}
                </span>
              </summary>
              <div className="space-y-2 border-t px-4 py-3">
                {group.parents.length === 0 ? (
                  <InlineEmpty>
                    {canWrite
                      ? EMPTY_MESSAGES.checklistCategory.canWrite
                      : EMPTY_MESSAGES.checklistCategory.readOnly}
                  </InlineEmpty>
                ) : (
                  group.parents.map((parent) => (
                    <div key={parent.id} className="space-y-2">
                      <ChecklistItemRow
                        slug={slug}
                        projectId={projectId}
                        item={parent}
                        subtaskCount={group.subtasks.get(parent.id)?.length ?? 0}
                        indent={false}
                        canWrite={canWrite}
                        // TASK_SPLIT は親タスクのみ対象。Dialog はここ(Server Component)で
                        // 生成して差し込み、`usage` が全行ぶん直列化されるのを避ける。
                        // `key` は必須: map の中で生成した要素を prop として渡すため、
                        // 付けないと React が「配列の子に key が無い」と警告する。
                        splitAction={
                          canWrite && parent.parentId === null ? (
                            <SplitTaskDialog
                              key={parent.id}
                              slug={slug}
                              projectId={projectId}
                              parent={parent}
                              usage={usage}
                            />
                          ) : undefined
                        }
                      />
                      {(group.subtasks.get(parent.id) ?? []).map((sub) => (
                        <ChecklistItemRow
                          key={sub.id}
                          slug={slug}
                          projectId={projectId}
                          item={sub}
                          subtaskCount={0}
                          indent={true}
                          canWrite={canWrite}
                        />
                      ))}
                      {/* 真のトップレベル項目(parentId=null)のみ、その直下に「+ サブタスク」を出す。
                          孤児サブタスクは parents 配列に居ても parentId !== null なので除外する(API ガードで 400 になる)。 */}
                      {canWrite && parent.parentId === null && (
                        <SubtaskAddSlot slug={slug} projectId={projectId} parent={parent} />
                      )}
                    </div>
                  ))
                )}
                {canWrite && (
                  <div className="pt-2">
                    <InlineAddForm slug={slug} projectId={projectId} category={category} />
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

interface CategoryGroup {
  parents: ChecklistItem[];
  subtasks: Map<string, ChecklistItem[]>;
}

/** カテゴリ別 + 親/子に再構築する(position は API の昇順をそのまま維持)。 */
function groupByCategory(items: readonly ChecklistItem[]): Record<Category, CategoryGroup> {
  const result: Record<Category, CategoryGroup> = {
    TECH: { parents: [], subtasks: new Map() },
    LEGAL: { parents: [], subtasks: new Map() },
    MARKETING: { parents: [], subtasks: new Map() },
    UX: { parents: [], subtasks: new Map() },
    OTHER: { parents: [], subtasks: new Map() },
  };

  const itemById = new Map(items.map((i) => [i.id, i]));

  for (const item of items) {
    if (item.parentId === null) {
      result[item.category].parents.push(item);
      continue;
    }
    const parent = itemById.get(item.parentId);
    if (!parent) {
      // 親が同一レスポンスに居ない孤児は render から漏れないようトップレベル化。
      result[item.category].parents.push(item);
      continue;
    }
    // サブタスクは親の category を継承して同カテゴリ群に置く(API の親 Category 継承仕様と整合)。
    const bag = result[parent.category].subtasks;
    let list = bag.get(item.parentId);
    if (!list) {
      list = [];
      bag.set(item.parentId, list);
    }
    list.push(item);
  }

  return result;
}

function countDone(group: CategoryGroup): number {
  let count = group.parents.filter((p) => p.status === 'DONE').length;
  for (const subs of group.subtasks.values()) {
    count += subs.filter((s) => s.status === 'DONE').length;
  }
  return count;
}
