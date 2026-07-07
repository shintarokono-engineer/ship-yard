'use client';

import { useActionState, useMemo } from 'react';

import { Button } from '@/components/ui/button';

import { initiateTwitterOAuthAction } from '../_actions/initiate-twitter-oauth';
import {
  INITIAL_INITIATE_TWITTER_OAUTH_FORM_STATE,
  type InitiateTwitterOAuthFormState,
} from '../_shared/initiate-twitter-oauth-form';

/**
 * X アカウント連携開始ボタン(ADR-014)。
 *
 * form action で Server Action `initiateTwitterOAuthAction` を起動し、Bearer JWT 付きで BE を叩き
 * 返ってきた X 認可 URL に `redirect()` させる。ブラウザから `<a href>` で BE を直接叩くと
 * Authorization ヘッダーが送られず 401 になるため、この経路が必須。
 */
export function TwitterConnectButton({ slug }: { slug: string }) {
  const boundAction = useMemo(() => initiateTwitterOAuthAction.bind(null, slug), [slug]);
  const [state, formAction, pending] = useActionState<
    InitiateTwitterOAuthFormState,
    FormData
  >(boundAction, INITIAL_INITIATE_TWITTER_OAUTH_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-busy={pending}>
        {pending ? '認可画面へ遷移中...' : 'X アカウントを連携'}
      </Button>
      {state.formError && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-2 py-1 text-xs"
        >
          {state.formError}
        </p>
      )}
    </form>
  );
}
