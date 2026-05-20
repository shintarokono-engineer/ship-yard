'use client';

import { useActionState, useMemo } from 'react';
import { ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { openPortalSessionAction } from '../_actions';
import {
  INITIAL_PORTAL_SESSION_STATE,
  type PortalSessionFormState,
} from '../_shared/portal-session-form';

/**
 * Stripe Customer Portal を開くボタン。Server Action で Portal Session を作り、返却 URL に redirect する。
 *
 * 成功時は `redirect()` でページが遷移するため、ここに戻ってくるのはエラー時のみ。
 * その場合はボタン下にエラーメッセージを表示する。
 */
export function PortalButton({ slug }: { slug: string }) {
  const boundAction = useMemo(() => openPortalSessionAction.bind(null, slug), [slug]);
  const [state, formAction, pending] = useActionState<PortalSessionFormState, FormData>(
    boundAction,
    INITIAL_PORTAL_SESSION_STATE,
  );

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          <ExternalLink aria-hidden="true" />
          {pending ? '起動中...' : 'Stripe Customer Portal を開く'}
        </Button>
      </form>
      {!state.ok && state.error && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}
    </div>
  );
}
