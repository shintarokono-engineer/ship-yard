'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NON_OWNER_ROLES, ROLE_LABELS, type Role } from '@/lib/api/types';

import { updateMemberRoleAction } from '../_actions/update-member-role';

/**
 * メンバー行のロール変更 Select。
 *
 * `useActionState` だと state を保持し続ける必要があるが、ロール変更は「即時送信 → toast 通知 →
 * 一覧再描画」だけなので `useTransition` で直接 Server Action を呼ぶ単純フローにする。
 *
 * 誤操作防止のため、選択後すぐには送信せず確認ダイアログを挟む。Select は `value={currentRole}`
 * の controlled なので、キャンセル時は表示が自動で元のロールに戻る(pendingRole の破棄だけでよい)。
 *
 * BE は変更後の状態を返すが、UI は `revalidatePath` で SSR 再取得した値を採用するので、
 * 楽観的 UI は組まない(壁を高くしない方針)。
 */
export function RoleSelect({
  slug,
  targetUserId,
  currentRole,
  memberName,
}: {
  slug: string;
  targetUserId: string;
  currentRole: Role;
  /** 対象メンバーの表示名。テーブル行内の裸 Select に文脈を与える aria-label 用。 */
  memberName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [pendingRole, setPendingRole] = useState<Role | null>(null);

  function onChange(next: string) {
    if (next === currentRole) return;
    setPendingRole(next as Role);
  }

  function onConfirm() {
    if (!pendingRole) return;
    startTransition(async () => {
      const result = await updateMemberRoleAction(slug, targetUserId, pendingRole);
      if (result.ok) {
        toast.success('ロールを変更しました。');
      } else {
        toast.error(result.formError ?? 'ロールの変更に失敗しました。');
      }
      setPendingRole(null);
    });
  }

  return (
    <>
      <Select value={currentRole} onValueChange={onChange} disabled={pending}>
        <SelectTrigger size="sm" className="min-w-32" aria-label={`${memberName} のロール`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {NON_OWNER_ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog
        open={pendingRole !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setPendingRole(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ロールを変更しますか?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{memberName}</span> のロールを{' '}
              <span className="font-medium text-foreground">{ROLE_LABELS[currentRole]}</span> から{' '}
              <span className="font-medium text-foreground">
                {pendingRole && ROLE_LABELS[pendingRole]}
              </span>{' '}
              に変更します。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingRole(null)}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button type="button" onClick={onConfirm} disabled={pending}>
              {pending ? '変更中...' : '変更する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
