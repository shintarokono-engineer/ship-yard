import { Check } from 'lucide-react';
import { SignUpButton } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// プラン細目(メンバー数上限・AI 回数など)は PROJECT_STATUS §9.8 / ADR-012 で確定予定のため、
// LP では流動的な数値を避け「個人 = Free/Pro、チーム = Team」の高レベル訴求に留める。
const PLANS = [
  {
    name: 'Free',
    price: '¥0',
    unit: '',
    tagline: '個人開発者向け',
    features: [
      'プロジェクト管理',
      'AI ドキュメント・LP・チェックリスト生成(月 20 回まで)',
      'ランディングページの作成と公開',
      'AI 壁打ち(RAG)',
    ],
    cta: '無料で始める',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '¥980',
    unit: '/ 月',
    tagline: '本格的に作る個人開発者向け',
    features: ['Free のすべての機能', 'AI 生成・AI 壁打ちが無制限', '個人開発をフルに支える機能'],
    cta: 'Pro を始める',
    highlighted: true,
  },
  {
    name: 'Team',
    price: '¥2,800',
    unit: '/ 人・月',
    tagline: '2 人以上のチーム向け',
    features: [
      'Pro のすべての機能',
      'チームメンバーの招待',
      '6 段階のロール権限管理',
      '共同編集・レビュー',
      '監査ログ',
    ],
    cta: 'Team を始める',
    highlighted: false,
  },
];

/** 料金プラン(Free / Pro / Team)の比較セクション。 */
export function PricingSection() {
  return (
    <section id="pricing" className="bg-card scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-primary text-sm font-semibold">PRICING</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            あなたの規模に合うプラン
          </h2>
          <p className="text-muted-foreground mt-4 text-pretty">
            まずは無料で。個人開発の本番運用は Pro、チームでの協働は Team へ。
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'bg-background relative flex flex-col rounded-2xl border p-8',
                plan.highlighted && 'border-primary ring-primary ring-1',
              )}
            >
              {plan.highlighted && (
                <span className="bg-primary text-primary-foreground absolute -top-3 left-8 rounded-full px-3 py-1 text-xs font-medium">
                  おすすめ
                </span>
              )}
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="text-muted-foreground mt-1 text-sm">{plan.tagline}</p>
              <p className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                {plan.unit && <span className="text-muted-foreground text-sm">{plan.unit}</span>}
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <SignUpButton mode="modal">
                <Button
                  size="lg"
                  variant={plan.highlighted ? 'default' : 'outline'}
                  className="mt-8 w-full"
                >
                  {plan.cta}
                </Button>
              </SignUpButton>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
