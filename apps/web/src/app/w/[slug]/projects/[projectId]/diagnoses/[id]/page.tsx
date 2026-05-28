import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  CompetitorRefList,
  ScoreAxisBars,
  ScoreRadarChart,
  ScoreSummary,
  SuggestionsList,
} from '@/components/score';
import { DIAGNOSIS_AXIS_LABEL } from '@/lib/api/types';
import { fetchDiagnosis, fetchProject, fetchWorkspace } from '@/lib/api/workspaces';

/**
 * `/w/{slug}/projects/{projectId}/diagnoses/{id}` — プロダクト診断 1 件の結果ページ。
 *
 * 5 軸ブレークダウン(差別化 / ターゲット明確性 / 機能完成度 / リリース準備度 / 競合優位性)、
 * 改善提案、競合参照を表示する。全テナントメンバーが閲覧可。IdeaValidation と違い
 * recommendation(GO/PIVOT/NO_GO)は無い。
 */
export default async function DiagnosisDetailPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; id: string }>;
}) {
  const { slug, projectId, id } = await params;

  const workspace = await fetchWorkspace(slug);
  if (!workspace) notFound();

  const project = await fetchProject(slug, projectId);
  if (!project) notFound();

  const diagnosis = await fetchDiagnosis(slug, projectId, id);
  if (!diagnosis) notFound();

  return (
    <div className="cursor-default space-y-6">
      <div className="space-y-2">
        <Link
          href={`/w/${slug}/projects/${projectId}/diagnoses`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          プロダクト診断の履歴へ戻る
        </Link>
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
        <h2 id="suggestions-heading" className="text-lg font-semibold">
          改善提案
        </h2>
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
