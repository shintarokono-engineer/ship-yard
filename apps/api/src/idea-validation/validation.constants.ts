/**
 * IDEA_VALIDATION(アイデア検証、ADR-013 改訂版「2 モード化」)の rubric / 評価軸定数。
 *
 * Project.status = IDEA のときに実行する Lean Startup の Problem-Solution Fit 検証機能。
 * PRODUCT_DIAGNOSIS と異なり「機能完成度」「リリース準備度」 は評価対象外で、代わりに
 * 「課題の強度」「市場性」 を評価する(発案段階で意味のある軸)。5 軸 × 各 0-20 点 = 100 点満点。
 *
 * ADR-016: 採点対象は「記述の巧拙」 ではなく「記述されている内容の実質」。criteria に
 * 「〜が言語化されているか」 の類を書かないこと(提案が作文添削になる)。軸のキーは既存レコード
 * (breakdown / Suggestion.axis)の互換のため変更しない。
 */

/** アイデア検証の評価軸(5 軸、各 0-20 点満点)。 */
export const VALIDATION_AXES = [
  'problemClarity',
  'targetClarity',
  'differentiation',
  'competitiveAdvantage',
  'marketPotential',
] as const;

/** `VALIDATION_AXES` の要素型。 */
export type ValidationAxis = (typeof VALIDATION_AXES)[number];

/** 各軸の最大点(rubric 設計、ADR-013 改訂版)。5 軸 × 20 = 100 点満点。 */
export const VALIDATION_AXIS_MAX_SCORE = 20;

/** 改善提案の最少件数(rubric)。 */
export const VALIDATION_MIN_SUGGESTIONS = 3;

/** 改善提案の最大件数(rubric)。 */
export const VALIDATION_MAX_SUGGESTIONS = 5;

/** 競合参照の最大件数(Web Search Tool で取得する想定数)。 */
export const VALIDATION_MAX_COMPETITOR_REFS = 5;

/** 意思決定支援の値(LLM が rubric に従って判定)。 */
export const VALIDATION_RECOMMENDATIONS = ['GO', 'PIVOT', 'NO_GO'] as const;

/** `VALIDATION_RECOMMENDATIONS` の要素型。 */
export type ValidationRecommendation = (typeof VALIDATION_RECOMMENDATIONS)[number];

/** 各軸の日本語ラベルと評価基準(system prompt に注入)。 */
export const VALIDATION_AXIS_RUBRIC: Record<ValidationAxis, { label: string; criteria: string }> = {
  problemClarity: {
    label: '課題の強度',
    criteria:
      'その課題が実在し、対象者にとって痛いかを評価する。記述の巧拙ではなく課題そのものの強さを見ること。誰も困っていない / 既存の標準的な手段で足りてしまう → 0-10 点、実在するが「あったら良い」 水準に留まる → 11-15 点、対象者が現に時間か金を払って回避している痛み → 16-20 点。',
  },
  targetClarity: {
    label: '対象の到達可能性',
    criteria:
      '想定ユーザーが実在し、まとまって存在し、到達経路があり、支払う余地があるかを評価する。「個人開発者向け」 のような属性の羅列は集団ではないため低く見ること。到達手段が思い当たらない → 0-10 点、集団は特定できるが到達経路が不明 → 11-15 点、最初の 10 人にどこで会えるかまで具体的 → 16-20 点。',
  },
  differentiation: {
    label: '打ち手の妥当性',
    criteria:
      'その解き方が課題に効くかを評価する。既存の代替(手作業 / 汎用ツール / 何もしない)で足りてしまわないか、価値が単一の前提に全依存していないかを見る。代替で足りてしまう → 0-10 点、効くが優位が薄い → 11-15 点、代替では埋められない構造的な理由がある → 16-20 点。',
  },
  competitiveAdvantage: {
    label: '競合優位性',
    criteria:
      'Web Search で取得した実競合(類似プロダクト)と比較して優位な領域があるか。Web Search 無効時は LLM の事前学習知識ベースで評価(精度低下を UI で明示)。劣位 → 0-10 点、互角 → 11-15 点、明確な優位 → 16-20 点。',
  },
  marketPotential: {
    label: '市場性',
    criteria:
      'ターゲット市場の規模・成長性が示唆できるか。ニッチすぎ / 縮小市場 → 0-10 点、安定市場 → 11-15 点、成長市場 + 一定規模 → 16-20 点。Web Search で取得した競合数 / 投資情報 / トレンドから推定。',
  },
};

/** rubric を 1 つの Markdown 文字列に整形(system prompt 注入用)。 */
export function formatValidationRubricForPrompt(): string {
  const lines = VALIDATION_AXES.map((axis, idx) => {
    const rubric = VALIDATION_AXIS_RUBRIC[axis];
    return `${idx + 1}. **${axis}** (${rubric.label}、${VALIDATION_AXIS_MAX_SCORE}点満点): ${rubric.criteria}`;
  });
  return lines.join('\n');
}

/** recommendation 判定の基準(system prompt 注入用)。 */
export const VALIDATION_RECOMMENDATION_GUIDANCE = [
  '採点後に以下の基準で recommendation を判定:',
  '- **GO**: 総合 75 点以上 + 全軸が 10 点以上(明確に進めるべきアイデア)',
  '- **PIVOT**: 総合 50-74 点 or 競合優位性 10 点未満(方向修正で改善余地あり)',
  '- **NO_GO**: 総合 50 点未満 or 課題の強度 5 点未満(根本的に再検討推奨)',
].join('\n');
