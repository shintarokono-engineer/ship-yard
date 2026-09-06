import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
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
import { cn } from '@/lib/utils';
import { fetchProject, fetchUsage, fetchWorkspace, listChecklist } from '@/lib/api/workspaces';

import { ChecklistItemRow } from './_components/checklist-item-row';
import { GenerateChecklistDialog } from './_components/generate-checklist-dialog';
import { InlineAddForm } from './_components/inline-add-form';
import { SplitTaskDialog } from './_components/split-task-dialog';
import { SubtaskAddSlot } from './_components/subtask-add-slot';

/**
 * `/w/{slug}/projects/{projectId}/checklist` — チェックリスト一覧。
 *
 * カテゴリ別の Collapsible セクションを縦に並べ、各セクション内で position 順に親→サブ階層表示。
 *
 * 初期表示は全カテゴリを畳む。畳んだ状態が色帯 + 進捗バー + 件数のサマリービューになる。
 * セクションの識別色は `CATEGORY_META` から取る。
 *
 * `?done=hide` で完了項目を隠す。フィルタ中でも件数・進捗は全件から数える
 * (数字まで動くと「終わったのか隠れているのか」 が区別できないため)。
 *
 * AI 一括生成はヘッダの「AI で一括生成」ボタンから(タスク分解は Day 23 で追加予定)。
 */
export default async function ChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectId: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { slug, projectId } = await params;
  // 完了を隠すフィルタ。URL に持たせて Server Component のまま切り替える(共有・戻るが効く)。
  const hideDone = (await searchParams).done === 'hide';

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

  // 件数・進捗は常に全件で数える(フィルタで数字が動くと「終わったのか隠れているのか」 が分からない)。
  // 一方、行の描画はフィルタ後のリストを使う。
  const groupedAll = groupByCategory(items);
  const grouped = hideDone ? groupByCategory(items.filter((i) => i.status !== 'DONE')) : groupedAll;

  const totalAll = items.length;
  const doneAll = items.filter((i) => i.status === 'DONE').length;
  const donePct = totalAll > 0 ? (doneAll / totalAll) * 100 : 0;

  const checklistHref = `/w/${slug}/projects/${projectId}/checklist`;

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

        {totalAll > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <Progress
              value={donePct}
              aria-label="チェックリスト全体の進捗"
              className="w-full max-w-64"
            />
            <span className="text-muted-foreground text-sm tabular-nums">
              {totalAll} 件中 {doneAll} 件完了
            </span>
            {/*
              トグル 1 個だとラベルが現在の状態を指すのか操作を指すのか判断できないので、
              選択肢を 2 つ並べて効いている方を塗る。実体はページ遷移なのでリンクで組む
              (Radix ToggleGroup は radio 相当のセマンティクスになり遷移には合わない)。
            */}
            <ButtonGroup className="ml-auto" aria-label="表示する項目">
              {[
                { label: 'すべて', href: checklistHref, active: !hideDone },
                { label: '未完了のみ', href: `${checklistHref}?done=hide`, active: hideDone },
              ].map((opt) => (
                <Button
                  key={opt.label}
                  asChild
                  size="sm"
                  variant={opt.active ? 'default' : 'outline'}
                >
                  <Link href={opt.href} aria-current={opt.active ? 'true' : undefined}>
                    {opt.label}
                  </Link>
                </Button>
              ))}
            </ButtonGroup>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {CATEGORIES.map((category) => {
          // 描画はフィルタ後、件数は常に全件から数える。
          const group = grouped[category];
          const allGroup = groupedAll[category];
          const totalCount = countItems(allGroup);
          const doneCount = countDone(allGroup);
          const isEmptyByFilter = hideDone && group.parents.length === 0 && totalCount > 0;
          return (
            /*
              `forceMount` は付けない。1 行ずつ独立した Server Action で更新するので、
              閉じても保存済みデータは失われない(まとめて submit するフォームではない)。
            */
            <Collapsible
              key={category}
              // 「未完了のみ」 は中身を見たい意図なので開く。それ以外は畳む。
              defaultOpen={hideDone}
              className={cn(
                'group overflow-hidden rounded-lg border border-l-4',
                CATEGORY_META[category].accentClassName,
              )}
            >
              <CollapsibleTrigger className="hover:bg-accent/30 focus-visible:ring-ring/50 flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors outline-none focus-visible:ring-[3px]">
                <span className="flex items-center gap-2 font-medium">
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      CATEGORY_META[category].dotClassName,
                    )}
                    aria-hidden="true"
                  />
                  {CATEGORY_META[category].label}
                </span>
                <span className="flex items-center gap-3">
                  <Progress
                    value={totalCount > 0 ? (doneCount / totalCount) * 100 : 0}
                    aria-label={`${CATEGORY_META[category].label} の進捗`}
                    className={cn(
                      'hidden h-1.5 w-24 sm:block',
                      CATEGORY_META[category].progressClassName,
                    )}
                  />
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {doneCount} / {totalCount}
                  </span>
                  <ChevronDown
                    className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 border-t px-4 py-3">
                {group.parents.length === 0 ? (
                  <InlineEmpty>
                    {isEmptyByFilter
                      ? EMPTY_MESSAGES.checklistCategoryAllDone
                      : canWrite
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
              </CollapsibleContent>
            </Collapsible>
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

/**
 * カテゴリ内の項目総数(親 + サブタスク)。
 * `subtasks` は `Map<parentId, ChecklistItem[]>` なので `.size` を件数に使わないこと。
 */
function countItems(group: CategoryGroup): number {
  let count = group.parents.length;
  for (const subs of group.subtasks.values()) {
    count += subs.length;
  }
  return count;
}
