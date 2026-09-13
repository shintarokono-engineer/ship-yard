const STEPS = [
  {
    n: 1,
    title: '作りたいものを書く',
    body: '誰の・どんな課題を・どう解決するアプリか。箇条書きでも構いません。登録も、細かい入力項目も要りません。',
  },
  {
    n: 2,
    title: 'AI が 3 つの観点で採点',
    body: '課題の強度・対象の到達可能性・打ち手の妥当性を各 20 点で採点し、そう判断した理由も返します。',
  },
  {
    n: 3,
    title: '改善提案を受け取る',
    body: '優先度 HIGH / MEDIUM / LOW に分けた改善提案が最大 5 件。結果 URL は共有もできます。',
  },
];

/** 使い方を 3 ステップで示すセクション。LP の `HowItWorksSection` と同じ構成に揃えている。 */
export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-primary text-sm font-semibold">HOW IT WORKS</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            書いて、20 秒待つだけ
          </h2>
        </div>
        <div className="mt-14 grid gap-10 lg:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="flex flex-col items-start">
              <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-full text-base font-semibold">
                {step.n}
              </span>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="text-muted-foreground mt-2 text-sm text-pretty">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
