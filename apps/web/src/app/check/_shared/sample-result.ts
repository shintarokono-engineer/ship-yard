/**
 * 実行前に見せる結果のイメージ(装飾用のモックで実データではない)。
 *
 * `SampleSection` と `ScorePreview` で同じ数字を出すため、ここで 1 つに持つ。
 */
export const SAMPLE_TOTAL_SCORE = 58;

export const SAMPLE_AXES = [
  {
    label: '課題の強度',
    score: 14,
    comment: '実際に時間をかけて回避している人がいて、困りごとがあることは確認できる。',
  },
  {
    label: '対象の到達可能性',
    score: 9,
    comment: '集団は特定できているが、最初の 10 人にどこで会うかが不明。',
  },
  {
    label: '打ち手の妥当性',
    score: 12,
    comment: '今あるやり方では埋めにくいが、選ばれる理由がまだ弱い。',
  },
] as const;

export const SAMPLE_SUGGESTION = {
  axisLabel: '対象の到達可能性',
  title: '最初の 10 人に会える場所を 1 つに決める',
  body: '想定する相手は決まっていますが、その人たちにどこで会えるかが書かれていません。既に集まっている場所(コミュニティ・イベント・ハッシュタグ)を 1 つ挙げ、そこで 10 人に声をかける前提で計画を立て直してください。',
} as const;
