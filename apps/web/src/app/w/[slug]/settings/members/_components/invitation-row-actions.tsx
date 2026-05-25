'use client';

import { useActionState, useEffect, useMemo } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { InvitationStatus } from '@/lib/api/types';

import { resendInvitationAction, type ResendInvitationState } from '../_actions/resend-invitation';
import { revokeInvitationAction, type RevokeInvitationState } from '../_actions/revoke-invitation';

const REVOKE_INITIAL: RevokeInvitationState = { ok: false };
const RESEND_INITIAL: ResendInvitationState = { ok: false };

/**
 * 招待行のアクション(取消 / 再送)。
 *
 * - PENDING:取消 + 再送
 * - EXPIRED:再送のみ(取消は意味がない)
 * - ACCEPTED / REVOKED:何も表示しない(BE 側でも 409 になる)
 *
 * 取消・再送ともに Server Action が `revalidatePath` するので、成功すると一覧が
 * 自動再描画されてこの行の status バッジが切り替わる。
 */
export function InvitationRowActions({
  slug,
  invitationId,
  status,
}: {
  slug: string;
  invitationId: string;
  status: InvitationStatus;
}) {
  const revokeBound = useMemo(
    () => revokeInvitationAction.bind(null, slug, invitationId),
    [slug, invitationId],
  );
  const resendBound = useMemo(
    () => resendInvitationAction.bind(null, slug, invitationId),
    [slug, invitationId],
  );

  const [revokeState, revokeAction, revokePending] = useActionState<
    RevokeInvitationState,
    FormData
  >(revokeBound, REVOKE_INITIAL);
  const [resendState, resendAction, resendPending] = useActionState<
    ResendInvitationState,
    FormData
  >(resendBound, RESEND_INITIAL);

  useEffect(() => {
    if (revokeState.ok) toast.success('招待を取り消しました。');
    else if (revokeState.formError) toast.error(revokeState.formError);
  }, [revokeState.ok, revokeState.formError]);

  useEffect(() => {
    if (resendState.ok) {
      if (resendState.mailSent) {
        toast.success(`${resendState.invitedEmail ?? ''} に招待を再送しました。`);
      } else {
        toast.warning(
          `招待は再発行されましたが、${resendState.invitedEmail ?? ''} へのメール送信に失敗しました。`,
        );
      }
    } else if (resendState.formError) {
      toast.error(resendState.formError);
    }
  }, [resendState.ok, resendState.mailSent, resendState.invitedEmail, resendState.formError]);

  if (status === 'ACCEPTED' || status === 'REVOKED') return null;

  return (
    <div className="flex items-center gap-1">
      <form action={resendAction}>
        <Button type="submit" variant="ghost" size="sm" disabled={resendPending}>
          <RefreshCw aria-hidden="true" />
          {resendPending ? '送信中...' : '再送'}
        </Button>
      </form>
      {status === 'PENDING' && (
        <form action={revokeAction}>
          <Button type="submit" variant="ghost" size="sm" disabled={revokePending}>
            <X aria-hidden="true" />
            {revokePending ? '取消中...' : '取消'}
          </Button>
        </form>
      )}
    </div>
  );
}
