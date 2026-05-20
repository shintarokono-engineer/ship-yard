'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NON_OWNER_ROLES, ROLE_LABELS } from '@/lib/api/types';

import {
  createInvitationAction,
  type InvitationFormState,
} from '../_actions/create-invitation';
import { INITIAL_INVITATION_FORM_STATE } from '../_shared/invitation-form';

const DEFAULT_ROLE = 'DEVELOPER';

/**
 * 招待発行ボタン + ダイアログ。
 *
 * `useActionState` の成功(`state.ok`)を `useEffect` で検知してダイアログを閉じ、
 * `mailSent` フラグで toast を出し分ける(招待は作られたがメール送信失敗のケースを救う)。
 */
export function InviteMemberDialog({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(() => createInvitationAction.bind(null, slug), [slug]);
  const [state, formAction, pending] = useActionState<InvitationFormState, FormData>(
    boundAction,
    INITIAL_INVITATION_FORM_STATE,
  );

  useEffect(() => {
    if (!state.ok) return;
    setOpen(false);
    if (state.mailSent) {
      toast.success(`${state.invitedEmail ?? ''} に招待メールを送信しました。`);
    } else {
      toast.warning(
        `招待は作成されましたが、${state.invitedEmail ?? ''} へのメール送信に失敗しました。一覧から「再送」してください。`,
      );
    }
  }, [state.ok, state.mailSent, state.invitedEmail]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" />
          メンバーを招待
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>メンバーを招待</DialogTitle>
          <DialogDescription>
            メールアドレスとロールを指定すると、招待リンクが届きます(有効期限 7 日)。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">メールアドレス</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              autoComplete="off"
              defaultValue={state.fields?.email ?? ''}
              aria-invalid={state.fieldErrors?.email ? true : undefined}
            />
            {state.fieldErrors?.email?.map((msg) => (
              <p key={msg} className="text-destructive text-xs">
                {msg}
              </p>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role">ロール</Label>
            <Select name="role" defaultValue={state.fields?.role ?? DEFAULT_ROLE}>
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue placeholder="ロールを選択" />
              </SelectTrigger>
              <SelectContent>
                {NON_OWNER_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}({role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.fieldErrors?.role?.map((msg) => (
              <p key={msg} className="text-destructive text-xs">
                {msg}
              </p>
            ))}
          </div>

          {state.formError && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {state.formError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '送信中...' : '招待を送る'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
