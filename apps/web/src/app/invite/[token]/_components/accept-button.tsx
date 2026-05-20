'use client';

import { useActionState, useMemo } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';

import {
  acceptInvitationAction,
  type AcceptInvitationFormState,
} from '../_actions/accept-invitation';

const INITIAL_STATE: AcceptInvitationFormState = { ok: false };

/**
 * 招待承諾ボタン + Server Action 連携。
 *
 * 未認証の場合は Server Action が `/sign-in?redirect_url=...` へ redirect するため、
 * Client 側で認証状態を気にする必要はない(Clerk のサインイン後にこのページに戻ってくる)。
 */
export function AcceptButton({ token, disabled }: { token: string; disabled?: boolean }) {
  const boundAction = useMemo(() => acceptInvitationAction.bind(null, token), [token]);
  const [state, formAction, pending] = useActionState<AcceptInvitationFormState, FormData>(
    boundAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.formError && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {state.formError}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending || disabled}
        aria-busy={pending}
        className="w-full"
      >
        <Check aria-hidden="true" />
        {pending ? '承諾中...' : '招待を承諾する'}
      </Button>
    </form>
  );
}
