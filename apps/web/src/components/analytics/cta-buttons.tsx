'use client';

import type { ComponentProps } from 'react';
import { SignInButton, SignUpButton } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';
import { trackCtaClick, type CtaLocation } from '@/lib/analytics';

/**
 * LP の CTA ボタン(`cta_click` 計測付き)。LP の各セクションは Server Component なので、
 * `onClick` を付けるためにこの Client ラッパーを挟む。**LP の CTA は必ずこれを使うこと。**
 *
 * Clerk の `<SignUpButton>` は子要素の `onClick` を潰さず、自前ハンドラ → モーダル起動の順に
 * 実行する(`wrappedChildClickHandler`)ため、計測を挟んでもモーダルの挙動は変わらない。
 */
type CtaButtonProps = {
  /** GA4 の `location` パラメータ。 */
  location: CtaLocation;
  /** ボタンの表示文言 = GA4 の `label` パラメータ。固定文言のみ(PII 不可)。 */
  label: string;
} & Pick<ComponentProps<typeof Button>, 'size' | 'variant' | 'className'>;

export function CtaSignUpButton({ location, label, ...buttonProps }: CtaButtonProps) {
  return (
    <SignUpButton mode="modal">
      <Button {...buttonProps} onClick={() => trackCtaClick(location, label)}>
        {label}
      </Button>
    </SignUpButton>
  );
}

/** サインインも新規獲得の分母を測るため同じく計測する。 */
export function CtaSignInButton({ location, label, ...buttonProps }: CtaButtonProps) {
  return (
    <SignInButton mode="modal">
      <Button {...buttonProps} onClick={() => trackCtaClick(location, label)}>
        {label}
      </Button>
    </SignInButton>
  );
}
