import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchInvitation } from '@/lib/api/invitations';
import { formatDateTime } from '@/lib/format';

import { AcceptButton } from './_components/accept-button';

/**
 * `/invite/[token]` — 招待承諾画面(未認証可、Day 18)。
 *
 * - サインアップ前のユーザーも招待内容を確認できる(GitHub / Slack / Notion 同パターン)
 * - 「承諾する」ボタンは Server Action 側で未認証なら `/sign-in?redirect_url=/invite/{token}` に redirect
 * - 期限切れ / 取り消し済み / 受諾済みは API が `status` 付きで返すので、状態ごとに表示分岐
 *
 * BE: `GET /invitations/:token`(未認証可)+ `POST /invitations/:token/accept`(認証必須)
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invitation = await fetchInvitation(token);
  if (!invitation) notFound();

  const status = invitation.status;
  const expired = status === 'EXPIRED';
  const revoked = status === 'REVOKED';
  const accepted = status === 'ACCEPTED';
  const acceptable = status === 'PENDING';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl">ワークスペースへの招待</CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{invitation.inviterName}</span> さんから
            <span className="font-medium text-foreground"> {invitation.workspaceName} </span>
            への招待が届いています。
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">招待先メール</dt>
              <dd className="font-medium">{invitation.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">ロール</dt>
              <dd>
                <Badge variant="outline">{invitation.roleLabel}</Badge>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">有効期限</dt>
              <dd className="text-xs">{formatDateTime(invitation.expiresAt)}</dd>
            </div>
          </dl>

          {expired && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              この招待リンクの有効期限が切れています。招待者に再送を依頼してください。
            </p>
          )}
          {revoked && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              この招待リンクは取り消されました。招待者に確認してください。
            </p>
          )}
          {accepted && (
            <p
              role="alert"
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100"
            >
              この招待はすでに承諾されています。ワークスペース一覧から該当ワークスペースを開いてください。
            </p>
          )}

          {acceptable && <AcceptButton token={token} />}
          {!acceptable && <AcceptButton token={token} disabled />}

          {acceptable && (
            <p className="text-muted-foreground text-xs">
              承諾には Shipyard へのサインインが必要です。サインアップしていない場合は承諾ボタンを押すとサインアップ画面に進みます。
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
