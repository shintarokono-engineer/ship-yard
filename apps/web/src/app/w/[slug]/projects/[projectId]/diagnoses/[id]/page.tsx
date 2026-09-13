import { notFound } from 'next/navigation';

import {
  CompetitorRefList,
  ScoreAxisBars,
  ScoreRadarChart,
  ScoreSummary,
  SuggestionsList,
} from '@/components/score';
import { ProjectBreadcrumbs } from '@/components/project-breadcrumbs';
import { DIAGNOSIS_AXIS_LABEL, isWriterRole } from '@/lib/api/types';
import { fetchDiagnosis, fetchProject, fetchUsage, fetchWorkspace } from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';

import { SuggestionTasksDialog } from '../../_components/suggestion-tasks-dialog';

/**
 * `/w/{slug}/projects/{projectId}/diagnoses/{id}` — プロダクト診断 1 件の結果ページ。
 *
 * 5 軸ブレークダウン(差別化の実効性 / 対象の到達可能性 / 機能完成度 / リリース準備度 / 競合優位性)、
 * 改善提案、競合参照を表示する。全テナントメンバーが閲覧可。IdeaValidation と違い
 * recommendation(GO/PIVOT/NO_GO)は無い。
 */
export default async function DiagnosisDetailPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; id: string }>;
}) {
  const { slug, projectId, id } = await params;

  const [workspace, project] = await Promise.all([
    fetchWorkspace(slug),
    fetchProject(slug, projectId),
  ]);
  if (!workspace || !project) notFound();

  // usage は F17 のタスク化ダイアログでクレジット残量を出すために取る(fetchUsage は cache 済み)。
  const [diagnosis, usage] = await Promise.all([
    fetchDiagnosis(slug, projectId, id),
    fetchUsage(slug),
  ]);
  if (!diagnosis) notFound();

  const canWrite = isWriterRole(workspace.role);

  return (
    <div className="cursor-default space-y-6">
      <div className="space-y-2">
        <ProjectBreadcrumbs
          workspace={workspace}
          project={project}
          feature="DIAGNOSIS"
          current={formatDateTime(diagnosis.createdAt)}
        />
        <h1 className="text-2xl font-semibold">プロダクト診断の結果</h1>
        <p className="text-muted-foreground text-sm">{project.name}</p>
      </div>

      <ScoreSummary
        totalScore={diagnosis.totalScore}
        modelUsed={diagnosis.modelUsed}
        webSearchUsed={diagnosis.webSearchUsed}
        createdAt={diagnosis.createdAt}
      />

      <section aria-labelledby="breakdown-heading" className="space-y-4">
        <h2 id="breakdown-heading" className="text-lg font-semibold">
          5 軸ブレークダウン
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ScoreRadarChart
            breakdown={diagnosis.breakdown}
            axisLabel={DIAGNOSIS_AXIS_LABEL}
            ariaLabel="プロダクト診断の 5 軸スコア(レーダーチャート)"
          />
          <ScoreAxisBars breakdown={diagnosis.breakdown} axisLabel={DIAGNOSIS_AXIS_LABEL} />
        </div>
      </section>

      <section aria-labelledby="suggestions-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="suggestions-heading" className="text-lg font-semibold">
            改善提案
          </h2>
          {canWrite && diagnosis.suggestions.length > 0 && (
            <SuggestionTasksDialog
              slug={slug}
              projectId={projectId}
              source="DIAGNOSIS"
              sourceId={diagnosis.id}
              suggestions={diagnosis.suggestions}
              axisLabel={DIAGNOSIS_AXIS_LABEL}
              usage={usage}
            />
          )}
        </div>
        <SuggestionsList suggestions={diagnosis.suggestions} axisLabel={DIAGNOSIS_AXIS_LABEL} />
      </section>

      <section aria-labelledby="competitors-heading" className="space-y-3">
        <h2 id="competitors-heading" className="text-lg font-semibold">
          競合参照
        </h2>
        <CompetitorRefList competitorRefs={diagnosis.competitorRefs} />
      </section>
    </div>
  );
}
