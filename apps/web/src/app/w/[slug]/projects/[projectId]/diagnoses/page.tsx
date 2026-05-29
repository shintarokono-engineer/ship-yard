import { ChevronLeft, Gauge } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EmptyState } from '@/components/empty-state';
import { isWriterRole } from '@/lib/api/types';
import { fetchProject, fetchUsage, fetchWorkspace, listDiagnoses } from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';

import { RunDiagnosisDialog } from './_components/run-diagnosis-dialog';

/**
 * `/w/{slug}/projects/{projectId}/diagnoses` — プロダクト診断(PRODUCT_DIAGNOSIS)履歴一覧。
 *
 * 閲覧は全テナントメンバー、実行は WRITER_ROLES のみ(BE 側でも 403 ガード)。
 * 履歴は `createdAt` 降順で並び、各行に総合スコアを表示する(IdeaValidation と違い recommendation はない)。
 */
export default async function DiagnosesPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  const workspace = await fetchWorkspace(slug);
  if (!workspace) notFound();

  const project = await fetchProject(slug, projectId);
  if (!project) notFound();

  const [diagnoses, usage] = await Promise.all([
    listDiagnoses(slug, projectId),
    fetchUsage(slug),
  ]);
  const canWrite = isWriterRole(workspace.role);
  const hasDiagnoses = diagnoses.length > 0;

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
            <h1 className="text-2xl font-semibold">プロダクト診断</h1>
            <p className="text-muted-foreground text-sm">
              開発中以降のプロジェクトを 5 軸(差別化 / ターゲット明確性 / 機能完成度 /
              リリース準備度 / 競合優位性)で AI がスコア化し、改善提案と競合参照を提示します。Pro /
              Team 限定機能です。
            </p>
          </div>
          {canWrite && <RunDiagnosisDialog slug={slug} projectId={projectId} usage={usage} />}
        </div>
      </div>

      {hasDiagnoses ? (
        <ul className="space-y-2">
          {diagnoses.map((d) => (
            <li key={d.id}>
              <Link
                href={`/w/${slug}/projects/${projectId}/diagnoses/${d.id}`}
                className="hover:bg-accent/30 focus-visible:ring-ring/50 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 outline-none transition-colors focus-visible:ring-[3px]"
              >
                <span className="flex items-center gap-3">
                  <Gauge className="text-muted-foreground size-4" aria-hidden="true" />
                  <span className="tabular-nums">
                    <span className="text-foreground text-xl font-semibold">{d.totalScore}</span>
                    <span className="text-muted-foreground text-xs"> / 100</span>
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {formatDateTime(d.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Gauge}
          title="まだ診断の履歴がありません。"
          description={
            canWrite
              ? '「診断を実行する」 から最初の診断を行いましょう。'
              : '書き込み権限を持つメンバーが診断を実行すると、ここに表示されます。'
          }
        />
      )}
    </div>
  );
}
