const STEPS = [
  {
    n: 1,
    title: 'ワークスペースとプロジェクトを作成',
    body: 'チームのワークスペースを用意し、進行中のプロダクトをプロジェクトとして登録します。',
  },
  {
    n: 2,
    title: 'AI と一緒に作る',
    body: 'ドキュメント・チェックリスト・ランディングページを AI 支援で一気に整えます。',
  },
  {
    n: 3,
    title: 'リリースして届ける',
    body: '公開ランディングページでプロダクトを世に出し、チェックリストでリリースを完了します。',
  },
];

/** プロダクトの使い方を 3 ステップで示すセクション。 */
export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-primary text-sm font-semibold">HOW IT WORKS</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            3 ステップで動き出す
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
