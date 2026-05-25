/**
 * PRODUCT_DIAGNOSIS(プロダクト診断、ADR-013)の rubric / 評価軸定数。
 *
 * 5 軸 × 各 0-20 点 = 総合 100 点の rubric は system prompt に明示し、Sonnet 4 が
 * 一貫した基準で採点できるようにする。本ファイルが rubric の唯一の真実の源で、
 * `diagnosis-types.ts` の TypeScript 型・`diagnosis-schema.ts` の Tool Use input_schema・
 * 本ファイルの system prompt テキストの 3 箇所で参照される。
 */

/** プロダクト診断の評価軸(5 軸、各 0-20 点満点)。 */
export const DIAGNOSIS_AXES = [
  'differentiation',
  'targetClarity',
  'featureCompleteness',
  'releaseReadiness',
  'competitiveAdvantage',
] as const;

/** `DIAGNOSIS_AXES` の要素型。 */
export type DiagnosisAxis = (typeof DIAGNOSIS_AXES)[number];

/** 各軸の最大点(rubric 設計、ADR-013)。5 軸 × 20 = 100 点満点。 */
export const DIAGNOSIS_AXIS_MAX_SCORE = 20;

/** 改善提案の最少件数(rubric)。これより少ないと不完全と見なす。 */
export const DIAGNOSIS_MIN_SUGGESTIONS = 3;

/** 改善提案の最大件数(rubric、過多にならないよう抑制)。 */
export const DIAGNOSIS_MAX_SUGGESTIONS = 5;

/** 競合参照の最大件数(Web Search Tool で取得する想定数、RAG_TOP_K と揃える)。 */
export const DIAGNOSIS_MAX_COMPETITOR_REFS = 5;

/** 各軸の日本語ラベルと評価基準(system prompt に注入)。 */
export const DIAGNOSIS_AXIS_RUBRIC: Record<DiagnosisAxis, { label: string; criteria: string }> = {
  differentiation: {
    label: '差別化',
    criteria:
      '競合と明確に異なる特徴があるか。ターゲット / 機能 / 価格 / 体験のいずれかで「これでなければならない理由」 が言語化されているか。曖昧な訴求 → 0-10 点、明確だが弱い → 11-15 点、明確で強い → 16-20 点。',
  },
  targetClarity: {
    label: 'ターゲット明確性',
    criteria:
      '想定ユーザーが README / LP で具体的に言語化されているか。「個人開発者向け」 だけでなく規模・目的・課題まで詳細か。漠然 → 0-10 点、属性が明確 → 11-15 点、課題まで言語化 → 16-20 点。',
  },
  featureCompleteness: {
    label: '機能完成度',
    criteria:
      'コア機能の網羅性 + ChecklistItem の完了率(DONE / 全体)。リリース後すぐ使える状態か。コア機能不足 → 0-10 点、コア機能はあるが穴あり → 11-15 点、コア + 周辺機能充実 → 16-20 点。',
  },
  releaseReadiness: {
    label: 'リリース準備度',
    criteria:
      '法務(利用規約 / プライバシーポリシー)/ 課金 / ドキュメント / オンボーディングが揃っているか。LP の publishedAt 有無もシグナル。要素欠如 → 0-10 点、最低限揃う → 11-15 点、完備 → 16-20 点。',
  },
  competitiveAdvantage: {
    label: '競合優位性',
    criteria:
      '実競合(Web Search 取得)と比較して優位な領域があるか。Web Search 無効時は LLM の事前学習知識に基づく評価(精度低下を UI で明示)。劣位 → 0-10 点、互角 → 11-15 点、明確な優位 → 16-20 点。',
  },
};

/** rubric を 1 つの Markdown 文字列に整形(system prompt 注入用)。 */
export function formatRubricForPrompt(): string {
  const lines = DIAGNOSIS_AXES.map((axis, idx) => {
    const rubric = DIAGNOSIS_AXIS_RUBRIC[axis];
    return `${idx + 1}. **${axis}** (${rubric.label}、${DIAGNOSIS_AXIS_MAX_SCORE}点満点): ${rubric.criteria}`;
  });
  return lines.join('\n');
}
