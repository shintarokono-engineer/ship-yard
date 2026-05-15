/**
 * RAG ヒットを LLM プロンプト用の「# 参考」セクションに整形する共通ロジック。
 * DraftGenService(README/LP 生成)と ChecklistGenService(チェックリスト生成)の両方から利用される。
 *
 * **プロンプトインジェクション対策(ADR-005)**:
 * 参考本文は ` ```markdown ... ``` ` で囲んで「コードブロック内の資料」として LLM に提示する。
 * 同テナント内のユーザー(REVIEWER 等)が悪意あるドキュメントで生成挙動を操作するリスクを減らす。
 */

/** RAG ヒットを prompt に注入するための最小型(`RagSearchService` の hit から `title` と切り詰め済み `content` だけ取る)。 */
export interface RagReference {
  title: string;
  /** 切り詰め済み本文(`RagSearchService` 側で `RAG_CONTENT_TRUNCATE_CHARS` 内に整形済み)。 */
  content: string;
}

/** 参考セクションの見出しと注意書き(機能ごとに文言を変えられるよう外出し)。 */
export interface ReferenceSectionOptions {
  /** セクション見出し(例: `'# 参考(過去プロジェクトのドキュメント)'`)。先頭の改行は呼び出し側で付ける。 */
  heading: string;
  /** LLM への注意書き(参考の使い方を 1〜2 文で説明)。 */
  guidance: string;
}

/**
 * 参考ドキュメントを整形した文字列を返す。空配列なら空文字を返し、`prompt.filter(Boolean)` で
 * 自然に除外される(コールドスタート対応)。
 *
 * 各参考は `## 参考 N: <title>` で区切り、本文は ` ```markdown ``` ` で囲む。
 */
export function formatReferenceSection(
  references: readonly RagReference[] | undefined,
  options: ReferenceSectionOptions,
): string {
  if (!references || references.length === 0) return '';
  const blocks = references.map(
    (ref, i) => `## 参考 ${i + 1}: ${ref.title}\n\n\`\`\`markdown\n${ref.content}\n\`\`\``,
  );
  return [`\n${options.heading}`, options.guidance, ...blocks].join('\n\n');
}
