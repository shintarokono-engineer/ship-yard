/** 構造化データ(FAQPage)にも流すため export する。 */
export const FAQS = [
  {
    q: '入力したアイデアは公開されますか?',
    a: '公開されません。結果ページは検索結果に出ないようにしてあり、推測できない URL を知っている人だけが開けます。共有ボタンを押すまでは誰にも渡りません。',
  },
  {
    q: '本当に無料ですか? 登録は要りますか?',
    a: '無料です。アカウント登録もクレジットカードも要りません。1 日あたりの実行回数に上限があり、到達した場合は翌日(午前 9 時)にまた使えます。',
  },
  {
    q: '入力したアイデアはどれくらい保存されますか?',
    a: '共有していない結果は 30 日で削除します。共有した結果は、貼った URL が開けなくならないよう残します。',
  },
  {
    q: 'なぜ 5 つのうち 2 つが採点されないのですか?',
    a: '競合優位性と市場性は、実際にある競合を調べて比べないと当てになりません。調べずに点を付けると、根拠のない結果を返すことになるためです。',
  },
];

/** よくある質問。無料公開ツールで最も引っかかる「データはどうなる」を先に潰す。 */
export function FaqSection() {
  return (
    <section className="scroll-mt-20 border-t">
      <div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
        <div className="text-center">
          <p className="text-primary text-sm font-semibold">FAQ</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">よくある質問</h2>
        </div>
        <dl className="mt-14 space-y-8">
          {FAQS.map((faq) => (
            <div key={faq.q} className="border-b pb-8 last:border-b-0 last:pb-0">
              <dt className="font-semibold">{faq.q}</dt>
              <dd className="text-muted-foreground mt-2 text-sm leading-6 text-pretty">{faq.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
