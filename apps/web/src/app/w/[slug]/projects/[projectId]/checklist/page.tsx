import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  CATEGORIES,
  CATEGORY_META,
  isWriterRole,
  type Category,
  type ChecklistItem,
} from '@/lib/api/types';
import { fetchProject, fetchWorkspace, listChecklist } from '@/lib/api/workspaces';

import { ChecklistItemRow } from './_components/checklist-item-row';
import { InlineAddForm } from './_components/inline-add-form';
import { SubtaskAddSlot } from './_components/subtask-add-slot';

/**
 * `/w/{slug}/projects/{projectId}/checklist` — チェックリスト一覧。
 *
 * カテゴリ別の `<details>` セクションを縦に並べ、各セクション内で position 順に親→サブ階層表示。
 * 折りたたみ状態はブラウザネイティブ挙動を活かす(SSR 初期表示は全カテゴリ展開)。
 * AI 生成 / タスク分解は Day 22/23 で追加予定。
 */
export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  const workspace = await fetchWorkspace(slug);
  if (!workspace) notFound();

  const project = await fetchProject(slug, projectId);
  if (!project) notFound();

  const items = await listChecklist(slug, projectId);
  const canWrite = isWriterRole(workspace.role);
  const grouped = groupByCategory(items);

  return (
    <div className="space-y-6 cursor-default">
      <div className="space-y-2">
        <Link
          href={`/w/${slug}/projects/${projectId}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {project.name} の詳細へ戻る
        </Link>
        <h1 className="text-2xl font-semibold">チェックリスト</h1>
        <p className="text-muted-foreground text-sm">
          リリース前に必要な作業をカテゴリ別に管理します。
        </p>
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
                  <p className="text-muted-foreground/70 text-sm italic">(項目なし)</p>
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
