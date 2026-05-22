import { SignUpButton } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';

/** ページ末尾の最終 CTA セクション。 */
export function CtaSection() {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-6xl px-6 py-20 text-center sm:py-24">
        <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          今日から、リリースを加速する。
        </h2>
        <p className="text-primary-foreground/80 mx-auto mt-4 max-w-xl text-pretty">
          無料プランで、すぐに始められます。クレジットカードは必要ありません。
        </p>
        <SignUpButton mode="modal">
          <Button
            size="lg"
            className="bg-card text-primary hover:bg-card/90 focus-visible:ring-white mt-8 shadow-xs"
          >
            無料で始める
          </Button>
        </SignUpButton>
      </div>
    </section>
  );
}
