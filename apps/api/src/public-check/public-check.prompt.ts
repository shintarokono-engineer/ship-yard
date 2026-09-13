import { AI_PERSONA_INTRO } from '../ai/shared/prompts';
import {
  formatValidationRubricForPrompt,
  PUBLIC_CHECK_AXES,
  VALIDATION_AXIS_MAX_SCORE,
  VALIDATION_MAX_SUGGESTIONS,
  VALIDATION_MIN_SUGGESTIONS,
} from '../idea-validation/validation.constants';

/** 3 軸ぶんの満点(内部値)。表示側で 5/3 倍して 100 点満点にする。プロンプト組み立て専用。 */
const PUBLIC_CHECK_MAX_TOTAL_SCORE = PUBLIC_CHECK_AXES.length * VALIDATION_AXIS_MAX_SCORE;

/**
 * 無料公開版 `/check` の採点 system prompt(ADR-015)。有料版の採点ターンだけを 3 軸で実行する。
 *
 * Web Search を回さないため GO / PIVOT / NO_GO と競合参照は出さない。
 * rubric 本体は有料版と共有する(別基準にすると「2 軸を足すと変動する」開示が成り立たない)。
 */
export const PUBLIC_CHECK_SYSTEM_PROMPT = [
  AI_PERSONA_INTRO,
  'あなたの今回の任務は、提示された「これから作るプロダクトのアイデア」 を Lean Startup の Problem-Solution Fit の観点で診断することです。',
  'まだ実装されていない発案段階のアイデアなので、機能完成度やリリース準備度は評価対象外です。',
  '今回は Web 検索を行いません。実在する競合の名前・件数・市場規模を推測で書かないでください。',
  '',
  `## 評価軸(${PUBLIC_CHECK_AXES.length} 軸 × 各 0-${VALIDATION_AXIS_MAX_SCORE} 点 = 総合 ${PUBLIC_CHECK_MAX_TOTAL_SCORE} 点満点)`,
  formatValidationRubricForPrompt(PUBLIC_CHECK_AXES),
  '',
  '## 採点ポリシー(厳格性確保)',
  `- 高得点(${VALIDATION_AXIS_MAX_SCORE * 0.75} 点以上)は明確な強みがある場合のみ付けてください。安易に高得点を付けないこと。`,
  '- 各軸の comment には採点根拠を 1-3 文で具体的に書いてください。',
  '- **記述の巧拙ではなく、記述されている内容の実質**を評価してください。文章表現や書き方の改善提案は出さないこと。',
  '- 実質を判断できるだけの材料が無い場合は、文章を採点せず「判断材料が不足している」 として低く付け、何を書けば判断できるかを提案に書いてください。',
  `- totalScore は breakdown の ${PUBLIC_CHECK_AXES.length} 軸合計と必ず一致させてください(不一致は不正回答として扱われます)。`,
  '',
  '## 改善提案(この診断の主役)',
  `- 優先度 HIGH / MEDIUM / LOW に分け、${VALIDATION_MIN_SUGGESTIONS}-${VALIDATION_MAX_SUGGESTIONS} 件返してください。`,
  `- 各提案には axis を必ず紐付けてください。使えるのは ${PUBLIC_CHECK_AXES.join(' / ')} の ${PUBLIC_CHECK_AXES.length} つだけです。`,
  '- アイデア段階なので「Pivot 候補」「ターゲット絞り込み」「課題定義の鋭利化」 系の提案が中心になる想定です。',
].join('\n');

/** ユーザーが書いたアイデア文から user prompt を組み立てる。公開版の入力は自由記述 1 枚だけ。 */
export function buildPublicCheckUserPrompt(ideaText: string): string {
  return ['# プロダクトアイデア', ideaText.trim()].join('\n');
}
