import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ChevronDown, Lock } from 'lucide-react';

import { ScoreAxisBars, SuggestionsList } from '@/components/score';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { fetchPublicCheck } from '@/lib/api/public-check';
import { getSiteUrl } from '@/lib/site-url';
import {
  AXIS_MAX_SCORE,
  PUBLIC_CHECK_AXES,
  PUBLIC_CHECK_LOCKED_AXES,
  toDisplayScore,
  VALIDATION_AXIS_LABEL,
  type PublicCheckAxis,
} from '@/lib/api/types';

import { SiteFooter } from '../../_components/marketing/site-footer';
import { CheckHeader } from '../_components/check-header';
import { ShareActions } from './_components/share-actions';

type CheckResultParams = Promise<{ id: string }>;

/**
 * 3 軸ぶんだけを持つ軸ラベル。`ScoreAxisBars` は `axisLabel` のキーで描画対象を決める。
 *
 * キーを直書きすると軸を変えたときにここだけ古いまま型も通るため、`PUBLIC_CHECK_AXES` から導出する。
 */
const PUBLIC_AXIS_LABEL = Object.fromEntries(
  PUBLIC_CHECK_AXES.map((axis) => [axis, VALIDATION_AXIS_LABEL[axis]]),
) as Record<PublicCheckAxis, string>;

/**
 * 結果ページのメタ(ADR-015)。
 *
 * **常に `noindex`**(共有後も維持する)。他人の未公開アイデアを検索結果に出さないため。
 */
export async function generateMetadata({
  params,
}: {
  params: CheckResultParams;
}): Promise<Metadata> {
  const { id } = await params;
  const check = await fetchPublicCheck(id);
  if (!check) {
    return { title: '結果が見つかりません', robots: { index: false, follow: false } };
  }

  const score = toDisplayScore(check.totalScore);
  return {
    title: `アイデア検証スコア ${score} / 100`,
    description: 'AI が採点したアプリのアイデアの検証結果です。',
    robots: { index: false, follow: false },
    openGraph: {
      title: `アイデア検証スコア ${score} / 100`,
      description: 'AI が採点したアプリのアイデアの検証結果です。',
      type: 'article',
    },
    twitter: { card: 'summary_large_image' },
  };
}

/**
 * `/check/{id}` — 無料公開アイデア検証の結果ページ(ADR-015)。
 *
 * スコアは API から内部値(0〜60)で受け取り、**この表示層でだけ** 100 点満点に正規化する。
 */
export default async function CheckResultPage({ params }: { params: CheckResultParams }) {
  const { id } = await params;
  const check = await fetchPublicCheck(id);
  if (!check) notFound();

  const score = toDisplayScore(check.totalScore);
  const shareUrl = `${getSiteUrl()}/check/${check.id}`;

  return (
    <div className="flex min-h-screen flex-col">
      <CheckHeader />
      <main className="from-accent/40 to-background flex-1 bg-linear-to-b">
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <p className="text-muted-foreground text-sm">アイデア検証スコア</p>
              <p className="flex items-baseline gap-1.5">
                <span className="text-7xl leading-none font-semibold tracking-tight tabular-nums">
                  {score}
                </span>
                <span className="text-muted-foreground text-xl">/ 100</span>
              </p>
              <Progress value={score} aria-label="アイデア検証スコア" className="h-2 max-w-xs" />
              <p className="text-muted-foreground text-xs">
                採点した {PUBLIC_CHECK_AXES.length} つの観点の合計を、100 点満点に直した値です。
              </p>
              <Separator className="my-2" />
              <ShareActions
                id={check.id}
                url={shareUrl}
                score={score}
                initiallyShared={check.shared}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">評価の内訳</CardTitle>
              <CardDescription>
                各 {AXIS_MAX_SCORE} 点満点。点数の下に、そう判断した理由を書いています。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ScoreAxisBars breakdown={check.breakdown} axisLabel={PUBLIC_AXIS_LABEL} />

              <Separator />

              {/* ロック 2 軸は非表示にせず、その場に見せる。 */}
              <ItemGroup className="gap-2">
                {PUBLIC_CHECK_LOCKED_AXES.map((axis) => (
                  <Item
                    key={axis}
                    variant="outline"
                    size="sm"
                    className="text-muted-foreground border-dashed bg-transparent"
                  >
                    <ItemMedia>
                      <span className="bg-muted flex size-6 items-center justify-center rounded-full">
                        <Lock className="size-3" aria-hidden="true" />
                      </span>
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="font-normal">{VALIDATION_AXIS_LABEL[axis]}</ItemTitle>
                    </ItemContent>
                    <ItemActions className="text-xs tabular-nums">? / {AXIS_MAX_SCORE}</ItemActions>
                  </Item>
                ))}
              </ItemGroup>

              {/* 有料版で点が下がりうることを、結果を見せる時点で開示する。 */}
              <p className="text-muted-foreground text-xs leading-5">
                この 2
                つは実際の競合を調べて採点します。加えると合計点は変わります(多くの場合下がります)。
              </p>
            </CardContent>
          </Card>

          <section aria-labelledby="suggestions-heading" className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 id="suggestions-heading" className="text-lg font-semibold">
                改善提案
              </h2>
              <Badge variant="secondary" className="tabular-nums">
                {check.suggestions.length} 件
              </Badge>
            </div>
            <SuggestionsList suggestions={check.suggestions} axisLabel={PUBLIC_AXIS_LABEL} />
          </section>

          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">競合優位性と市場性も見る</CardTitle>
              <CardDescription className="leading-6">
                アカウントを作成すると、実際の競合を調べたうえで残りの 2
                つも採点します。いま入力したアイデアはそのまま引き継がれるので、書き直す必要はありません。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="lg">
                {/* 直接 claim へ戻すと Clerk のクライアント遷移で RSC の redirect が follow されず
                    白紙化しうるため、`/sign-in-complete?next=...` を経由させる。 */}
                <Link
                  href={`/sign-up?redirect_url=${encodeURIComponent(
                    `/sign-in-complete?next=/check/${check.id}/claim`,
                  )}`}
                >
                  競合と市場も採点してもらう
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Collapsible className="group/idea">
            <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between gap-2 text-sm font-medium">
              診断したアイデア
              <ChevronDown
                className="size-4 transition-transform group-data-[state=open]/idea:rotate-180"
                aria-hidden="true"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="bg-muted/40 text-muted-foreground mt-3 rounded-lg border p-4 text-sm leading-6 whitespace-pre-wrap">
                {check.ideaText}
              </p>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex flex-col gap-6">
            <Separator />
            <Button asChild variant="ghost" size="sm" className="self-start">
              <Link href="/check">別のアイデアを診断する</Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
