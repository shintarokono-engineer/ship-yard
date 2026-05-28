import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  CompetitorRefList,
  RecommendationBadge,
  ScoreAxisBars,
  ScoreRadarChart,
  ScoreSummary,
  SuggestionsList,
} from '@/components/score';
import { VALIDATION_AXIS_LABEL } from '@/lib/api/types';
import { fetchIdeaValidation, fetchProject, fetchWorkspace } from '@/lib/api/workspaces';

/**
 * `/w/{slug}/projects/{projectId}/idea-validations/{id}` — アイデア検証 1 件の結果ページ。
 *
 * 5 軸ブレークダウン(問題明確性 / ターゲット明確性 / 差別化 / 競合優位性 / 市場性)に加え、
 * GO / PIVOT / NO_GO の意思決定支援値、改善提案、競合参照を表示する。
 * 全テナントメンバーが閲覧可。再実行は履歴一覧から(本ページにはボタンを置かない)。
 */
export default async function IdeaValidationDetailPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; id: string }>;
}) {
  const { slug, projectId, id } = await params;

  const workspace = await fetchWorkspace(slug);
  if (!workspace) notFound();

  const project = await fetchProject(slug, projectId);
  if (!project) notFound();

  const validation = await fetchIdeaValidation(slug, projectId, id);
  if (!validation) notFound();

  return (
    <div className="cursor-default space-y-6">
      <div className="space-y-2">
        <Link
          href={`/w/${slug}/projects/${projectId}/idea-validations`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          アイデア検証の履歴へ戻る
        </Link>
        <h1 className="text-2xl font-semibold">アイデア検証の結果</h1>
        <p className="text-muted-foreground text-sm">{project.name}</p>
      </div>

      <ScoreSummary
        totalScore={validation.totalScore}
        modelUsed={validation.modelUsed}
        webSearchUsed={validation.webSearchUsed}
        createdAt={validation.createdAt}
      />

      <section aria-labelledby="recommendation-heading" className="space-y-3">
        <h2 id="recommendation-heading" className="text-lg font-semibold">
          意思決定支援
        </h2>
        <RecommendationBadge recommendation={validation.recommendation} size="lg" />
      </section>

      <section aria-labelledby="breakdown-heading" className="space-y-4">
        <h2 id="breakdown-heading" className="text-lg font-semibold">
          5 軸ブレークダウン
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ScoreRadarChart
            breakdown={validation.breakdown}
            axisLabel={VALIDATION_AXIS_LABEL}
            ariaLabel="アイデア検証の 5 軸スコア(レーダーチャート)"
          />
          <ScoreAxisBars breakdown={validation.breakdown} axisLabel={VALIDATION_AXIS_LABEL} />
        </div>
      </section>

      <section aria-labelledby="suggestions-heading" className="space-y-3">
        <h2 id="suggestions-heading" className="text-lg font-semibold">
          改善提案
        </h2>
        <SuggestionsList suggestions={validation.suggestions} axisLabel={VALIDATION_AXIS_LABEL} />
      </section>

      <section aria-labelledby="competitors-heading" className="space-y-3">
        <h2 id="competitors-heading" className="text-lg font-semibold">
          競合参照
        </h2>
        <CompetitorRefList competitorRefs={validation.competitorRefs} />
      </section>
    </div>
  );
}
