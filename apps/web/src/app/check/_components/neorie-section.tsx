import Link from 'next/link';
import { ArrowRight, LayoutTemplate, ListChecks, Sparkles } from 'lucide-react';

import { CtaSignUpButton } from '@/components/analytics/cta-buttons';
import { Button } from '@/components/ui/button';

const FEATURES = [
  {
    icon: Sparkles,
    title: '競合と市場も採点',
    body: '実際の競合を調べたうえで、5 つすべての観点で採点します。',
  },
  {
    icon: ListChecks,
    title: 'リリースチェックリスト',
    body: '改善提案をそのまま実行可能なタスクへ分解し、リリースまで追いかけます。',
  },
  {
    icon: LayoutTemplate,
    title: 'ドキュメントとページの作成',
    body: 'README・告知文・ランディングページを AI が下書きし、公開 URL まで完結します。',
  },
];

/** このツールの提供元(Neorie 本体)を説明するセクション。ツール単体で終わらせないための導線。 */
export function NeorieSection() {
  return (
    <section className="bg-card scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-primary text-sm font-semibold">ABOUT NEORIE</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            このツールは Neorie の入口です
          </h2>
          <p className="text-muted-foreground mt-4 text-pretty">
            Neorie(ネオリー)は、個人開発者と 2〜10
            人のチームのためのプロダクト開発プラットフォーム。 アイデアの検証からリリースまでを 1
            か所で進められます。
          </p>
        </div>

        <div className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <span className="bg-accent text-primary flex size-11 items-center justify-center rounded-lg">
                <feature.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground mt-2 text-sm text-pretty">{feature.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-3">
          <CtaSignUpButton location="check" label="7 日間の無料トライアルを始める" size="lg" />
          <Button asChild variant="outline" size="lg">
            <Link href="/">
              Neorie について
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground mt-4 text-center text-sm">
          クレジットカード不要。診断だけ使って離脱しても構いません。
        </p>
      </div>
    </section>
  );
}
