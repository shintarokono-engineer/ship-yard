'use client';

import { useActionState, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import {
  disconnectTwitterAction,
  INITIAL_DISCONNECT_TWITTER_FORM_STATE,
  type DisconnectTwitterFormState,
} from '../_actions/disconnect-twitter';

/** Twitter アカウント切断ボタン + 確認 Dialog(ADR-014、OWNER / ADMIN のみ)。 */
export function TwitterDisconnectButton({
  slug,
  accountId,
  handle,
}: {
  slug: string;
  accountId: string;
  handle: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => disconnectTwitterAction.bind(null, slug, accountId),
    [slug, accountId],
  );
  const [state, formAction, pending] = useActionState<DisconnectTwitterFormState, FormData>(
    boundAction,
    INITIAL_DISCONNECT_TWITTER_FORM_STATE,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          <Trash2 className="size-3.5" aria-hidden="true" />
          切断
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>X アカウントの連携を切断しますか?</DialogTitle>
          <DialogDescription>
            <span className="text-foreground font-medium">@{handle}</span>{' '}
            との連携を解除します。再連携するには再度認可フローを通す必要があります。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          {state.formError && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive mb-3 rounded-md border px-3 py-2 text-sm"
            >
              {state.formError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? '切断中...' : '切断する'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
