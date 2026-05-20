'use client';

import { useActionState, useMemo, useState } from 'react';
import { LogOut, UserMinus } from 'lucide-react';

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
import type { Member } from '@/lib/api/types';

import {
  removeMemberAction,
  type RemoveMemberState,
} from '../_actions/remove-member';

const INITIAL_STATE: RemoveMemberState = { ok: false };

/**
 * メンバー削除ダイアログ。自己退会と他者削除を 1 コンポーネントで両対応する
 * (BE 側も同じ DELETE エンドポイントを使う設計)。
 *
 * 自己退会の場合は Server Action が成功時に `/` へ redirect するため、こちらは
 * close ロジックを書かない。redirect 中にダイアログが消えても問題ない。
 */
export function DeleteMemberDialog({
  slug,
  member,
  isSelfWithdrawal,
}: {
  slug: string;
  member: Member;
  isSelfWithdrawal: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => removeMemberAction.bind(null, slug, member.userId, isSelfWithdrawal),
    [slug, member.userId, isSelfWithdrawal],
  );
  const [state, formAction, pending] = useActionState<RemoveMemberState, FormData>(
    boundAction,
    INITIAL_STATE,
  );

  const displayName = member.user.name?.trim() || member.user.email;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isSelfWithdrawal ? 'outline' : 'ghost'} size="sm">
          {isSelfWithdrawal ? (
            <>
              <LogOut aria-hidden="true" />
              退会
            </>
          ) : (
            <>
              <UserMinus aria-hidden="true" />
              削除
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isSelfWithdrawal
              ? 'このワークスペースから退会しますか?'
              : 'メンバーを削除しますか?'}
          </DialogTitle>
          <DialogDescription>
            {isSelfWithdrawal ? (
              <>
                退会すると、このワークスペースのプロジェクト・チェックリスト・ドキュメントに
                アクセスできなくなります。再参加には招待が必要です。
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{displayName}</span>{' '}
                をこのワークスペースから削除します。本人のアカウント自体は削除されません。
              </>
            )}
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
              {pending ? '処理中...' : isSelfWithdrawal ? '退会する' : '削除する'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
