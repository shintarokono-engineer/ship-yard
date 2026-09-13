import { Sparkles } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

import { CheckForm } from './check-form';
import { ScorePreview } from './score-preview';

/** ファーストビュー。見出しと入力フォームを 1 画面に収め、着地から入力までの距離をゼロにする。 */
export function HeroSection() {
  return (
    <section className="from-accent/60 to-background relative isolate overflow-hidden bg-linear-to-b">
      {/* 背景の造形。ドットグリッドとブランド色のグローで、白紙のフォームに見えないようにする。 */}
      <div
        aria-hidden="true"
        className="[background-size:22px_22px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)] absolute inset-0 -z-10 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)]"
      />
      <div
        aria-hidden="true"
        className="bg-primary/15 absolute -top-24 left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full blur-3xl"
      />

      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <div className="flex flex-col items-center text-center">
          <span className="border-primary/20 bg-card/80 text-primary mb-6 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur">
            <Sparkles className="size-3.5" aria-hidden="true" />
            ログイン不要・完全無料・20 秒で結果
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:whitespace-nowrap">
            そのアプリのアイデア、<span className="text-primary">100 点満点</span>で採点します。
          </h1>
          <p className="text-muted-foreground mt-6 max-w-2xl text-lg text-pretty">
            これから作るアプリ・Web サービスのアイデアを書くだけ。「その困りごとは本物か」
            「誰に届けるのか」「その解き方で足りるのか」を AI が見て、次に直すべきことまで返します。
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
          <Card className="shadow-xl">
            <CardContent>
              <CheckForm />
            </CardContent>
          </Card>
          <ScorePreview />
        </div>
      </div>
    </section>
  );
}
