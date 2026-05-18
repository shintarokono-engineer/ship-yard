/**
 * AI 機能で使う systemPrompt の共通部品(Day 16 で集約)。
 *
 * **AI_PERSONA_INTRO**: 4 機能(DRAFT_GEN / CHECKLIST_GEN / REFINE_DOC / TASK_SPLIT)で全く同じ
 * 冒頭文を使っていたため定数化。トーン変更が 1 箇所修正で済み、機能追加時の書き忘れも防げる。
 * 「対象が個人開発者+小規模チーム」というプロダクト位置付け(`docs/PROJECT_STATUS.md` §1)を
 * AI 側にも一貫して伝えるための、機能横断の不変要素。
 *
 * **taskItemGuidance(titleExample)**: 「タスク項目の配列」を AI に出力させる 2 機能
 * (CHECKLIST_GEN / TASK_SPLIT)で共通する title / description の書き方ガイダンス。
 * `titleExample` は機能ごとに自然な例を渡す(CHECKLIST_GEN は「OG 画像を用意する」、
 * TASK_SPLIT は「サインアップ画面のレイアウトを実装する」)。
 *
 * 1 ファイルにまとめている理由: 現状 2 部品しか無く、ディレクトリ分離するほどの規模ではないため
 * (`prompts/persona.ts` + `prompts/task-item-guidance.ts` から統合)。3 件目を追加するときに
 * 改めて `prompts/` ディレクトリに分割する運用とする。
 */

export const AI_PERSONA_INTRO =
  'あなたは個人開発者・小規模チームのプロダクトリリースを支援するアシスタントです。';

export function taskItemGuidance(titleExample: string): string {
  return [
    `各項目の title は実行可能な短い動詞句(例: 「${titleExample}」)。`,
    'description は補足が必要な場合のみ書き、自明な項目は省略してください。',
  ].join('');
}
