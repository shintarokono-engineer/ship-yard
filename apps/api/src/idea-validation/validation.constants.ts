/**
 * IDEA_VALIDATION(アイデア検証、ADR-013 改訂版「2 モード化」)の rubric / 評価軸定数。
 *
 * Project.status = IDEA のときに実行する Lean Startup の Problem-Solution Fit 検証機能。
 * PRODUCT_DIAGNOSIS と異なり「機能完成度」「リリース準備度」 は評価対象外で、代わりに
 * 「問題明確性」「市場性」 を評価する(発案段階で意味のある軸)。5 軸 × 各 0-20 点 = 100 点満点。
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
    label: '問題明確性',
    criteria:
      '解こうとしている課題が具体的に言語化されているか。「不便を解消する」 のような抽象では低く、「リモートワーカーが集中力を 25 分維持する手段に困っている」 のような具体性なら高い。漠然 → 0-10 点、課題は明確だが範囲広い → 11-15 点、ペルソナ・状況・痛みまで明確 → 16-20 点。',
  },
  targetClarity: {
    label: 'ターゲット明確性',
    criteria:
      '想定ユーザーが「誰の・どんな課題か」 で具体的に言語化されているか。「個人開発者向け」 だけでなく規模・目的・現状の代替手段まで詳細か。漠然 → 0-10 点、属性が明確 → 11-15 点、課題と現状代替まで言語化 → 16-20 点。',
  },
  differentiation: {
    label: '差別化',
    criteria:
      'プロダクトの核となる差別化軸が明確か。「便利な〇〇」 のような曖昧な差別化は低く、「既存 X が解決していない Y を 〇〇 という方法で解決」 のように軸が明確なら高い。曖昧 → 0-10 点、軸はあるが弱い → 11-15 点、明確で強い → 16-20 点。',
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
  '- **NO_GO**: 総合 50 点未満 or 問題明確性 5 点未満(根本的に再検討推奨)',
].join('\n');
