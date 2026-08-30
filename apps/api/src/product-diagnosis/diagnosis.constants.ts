/**
 * PRODUCT_DIAGNOSIS(プロダクト診断、ADR-013)の rubric / 評価軸定数。
 *
 * 5 軸 × 各 0-20 点 = 総合 100 点の rubric は system prompt に明示し、Sonnet 4 が
 * 一貫した基準で採点できるようにする。
 *
 * ADR-016: 採点対象は「記述の巧拙」 ではなく「記述されている内容の実質」。criteria に
 * 「〜が言語化されているか」 の類を書かないこと(提案が作文添削になる)。軸のキーは既存レコード
 * (breakdown / Suggestion.axis)の互換のため変更しない。本ファイルが rubric の唯一の真実の源で、
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
    label: '差別化の実効性',
    criteria:
      '競合と異なる特徴が機能として実在し、ユーザーがそれを理由に選ぶかを評価する。README / LP の訴求文にあるだけで実装や体験に現れていない差別化は評価しないこと。訴求のみで実体が無い → 0-10 点、実在するが選択理由になりにくい → 11-15 点、実在し選択理由になる → 16-20 点。',
  },
  targetClarity: {
    label: '対象の到達可能性',
    criteria:
      '想定ユーザーが実在し、到達経路があり、支払う余地があるかを評価する。機能 / 価格 / オンボーディングがその対象と噛み合っているかも見ること。対象と実装が噛み合っていない / 到達手段が不明 → 0-10 点、対象は定まるが到達経路が弱い → 11-15 点、対象・到達経路・価格が整合している → 16-20 点。',
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
