import { ChevronLeft, Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { VALIDATION_RECOMMENDATION_META, isWriterRole } from '@/lib/api/types';
import {
  fetchProject,
  fetchUsage,
  fetchWorkspace,
  listIdeaValidations,
} from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';

import { RunValidationDialog } from './_components/run-validation-dialog';

/**
 * `/w/{slug}/projects/{projectId}/idea-validations` — アイデア検証(IDEA_VALIDATION)履歴一覧。
 *
 * 閲覧は全テナントメンバー、実行は WRITER_ROLES のみ(`isWriterRole` で出し分け、BE 側でも 403 ガード)。
 * 履歴は `createdAt` 降順で並び、各行に総合スコア + recommendation(GO/PIVOT/NO_GO)を表示する。
 */
export default async function IdeaValidationsPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  const workspace = await fetchWorkspace(slug);
  if (!workspace) notFound();

  const project = await fetchProject(slug, projectId);
  if (!project) notFound();

  const [validations, usage] = await Promise.all([
    listIdeaValidations(slug, projectId),
    fetchUsage(slug),
  ]);
  const canWrite = isWriterRole(workspace.role);
  const hasValidations = validations.length > 0;

  return (
    <div className="cursor-default space-y-6">
      <div className="space-y-2">
        <Link
          href={`/w/${slug}/projects/${projectId}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {project.name} の詳細へ戻る
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">アイデア検証</h1>
            <p className="text-muted-foreground text-sm">
              Lean Startup の Problem-Solution Fit 観点で AI がアイデアを 5 軸スコア化し、 GO /
              PIVOT / NO_GO の意思決定を支援します。Pro / Team 限定機能です。
            </p>
          </div>
          {canWrite && <RunValidationDialog slug={slug} projectId={projectId} usage={usage} />}
        </div>
      </div>

      {hasValidations ? (
        <ul className="space-y-2">
          {validations.map((v) => {
            const meta = VALIDATION_RECOMMENDATION_META[v.recommendation];
            const variant =
              meta.tone === 'positive'
                ? 'default'
                : meta.tone === 'negative'
                  ? 'destructive'
                  : 'secondary';
            return (
              <li key={v.id}>
                <Link
                  href={`/w/${slug}/projects/${projectId}/idea-validations/${v.id}`}
                  className="hover:bg-accent/30 focus-visible:ring-ring/50 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 outline-none transition-colors focus-visible:ring-[3px]"
                >
                  <span className="flex items-center gap-3">
                    <Badge variant={variant} className="font-semibold tracking-wide">
                      {meta.label}
                    </Badge>
                    <span className="tabular-nums">
                      <span className="text-foreground text-xl font-semibold">{v.totalScore}</span>
                      <span className="text-muted-foreground text-xs"> / 100</span>
                    </span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {formatDateTime(v.createdAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={Lightbulb}
          title="まだアイデア検証の履歴がありません。"
          description={
            canWrite
              ? '「検証を実行する」 から最初の検証を行いましょう。'
              : '書き込み権限を持つメンバーが検証を実行すると、ここに表示されます。'
          }
        />
      )}
    </div>
  );
}
