/**
 * 構造化データ(JSON-LD)を `<script type="application/ld+json">` で埋め込む(F10、§9.12.2 観点 10)。
 *
 * `JSON.stringify` の出力中の `<` を `<` にエスケープし、値に `</script>` が含まれても
 * スクリプトが途中で閉じない(XSS 対策、Next.js 公式推奨パターン)。`data` は単一オブジェクトでも
 * 配列でも渡せる(複数 schema を 1 ページに併記する場合)。
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
