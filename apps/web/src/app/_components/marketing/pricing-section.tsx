import { Check, Clock } from 'lucide-react';
import { SignUpButton } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * プランの訴求項目。`upcoming: true` は**まだ提供していない**機能。
 *
 * 提供済みと同じチェックマークで並べると「契約すれば今すぐ使える」と誤認させるため、
 * アイコン・文字色・バッジで明確に区別する。2026-08-04 の公開前レビューで、監査ログと
 * 共同編集・レビューが未実装のまま Team プランの訴求に使われていたのを是正したもの
 * (`AuditLog` モデルも `Comment` モデルも存在しない)。
 *
 * **実装したらこのフラグを外すこと。** 付けっぱなしだと逆に「いつまでも来ない機能」に見える。
 */
type PlanFeature = { label: string; upcoming?: boolean };

// プラン構造は ADR-012(F 案)で確定:Free は廃止 → 新規登録は 7 日 Pro 全機能トライアル、
// 個人 = Pro ¥1,480、チーム = Team ¥2,800/人。AI は月次クレジット制(Haiku=1 / Sonnet=3)。
const PLANS: {
  name: string;
  price: string;
  unit: string;
  tagline: string;
  features: PlanFeature[];
  cta: string;
  highlighted: boolean;
}[] = [
  {
    name: 'Trial',
    price: '¥0',
    unit: '/ 7 日間',
    tagline: 'まず無料で試したい方向け(クレカ不要)',
    features: [
      { label: 'Pro 全機能を 7 日間お試し' },
      { label: 'AI クレジット 300(Pro と同等)' },
      { label: 'クレジットカード登録不要' },
      { label: 'トライアル終了後は AI 停止(プロジェクトは閲覧可能)' },
    ],
    cta: '無料トライアルを始める',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '¥1,480',
    unit: '/ 月',
    tagline: '本格的に作る個人開発者向け',
    features: [
      { label: 'AI クレジット 300 / 月(Haiku 1cr / Sonnet 3cr)' },
      { label: 'Sonnet 4 / Haiku 4.5 自由切替' },
      { label: '複数プロジェクト無制限' },
      // 「優先サポート」は窓口も SLA も無い状態だったので、実体のある表現に置き換える。
      { label: 'お問い合わせへの優先対応' },
    ],
    cta: 'Pro を始める',
    highlighted: true,
  },
  {
    name: 'Team',
    price: '¥2,800',
    unit: '/ 人・月',
    tagline: '2 人以上のチーム向け(7 日無料トライアル)',
    features: [
      { label: 'Pro のすべての機能' },
      { label: 'AI クレジット 800 / 人・月(共有プール)' },
      { label: 'メンバー招待 + 6 段階のロール権限' },
      { label: '共同編集・レビュー', upcoming: true },
      { label: '監査ログ', upcoming: true },
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
            まずは 7 日無料トライアルで。個人開発の本番運用は Pro、チームでの協働は Team へ。
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
                  <li key={feature.label} className="flex items-start gap-2 text-sm">
                    {feature.upcoming ? (
                      <Clock
                        className="text-muted-foreground mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className={cn(feature.upcoming && 'text-muted-foreground')}>
                      {feature.label}
                      {feature.upcoming && (
                        <span className="bg-muted text-muted-foreground ml-2 rounded px-1.5 py-0.5 text-xs font-medium">
                          近日提供
                        </span>
                      )}
                    </span>
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
