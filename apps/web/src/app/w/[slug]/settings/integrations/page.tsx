import { notFound } from 'next/navigation';
import { Twitter } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listTwitterAccounts } from '@/lib/api/integrations';
import { isAdminRole } from '@/lib/api/types';
import { fetchWorkspace } from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';

import { TwitterConnectButton } from './_components/twitter-connect-button';
import { TwitterDisconnectButton } from './_components/twitter-disconnect-button';

/**
 * `/w/{slug}/settings/integrations` — 外部サービス連携設定(ADR-014)。
 *
 * MVP では Twitter (X) のみ。連携の追加 / 切断は OWNER / ADMIN のみ実行可、一覧表示は所属メンバー全員可。
 * 連携追加は Server Action `initiateTwitterOAuthAction` 経由で BE の `/authorize` を Bearer JWT 付きで
 * 叩き、返ってきた X 認可 URL に `redirect()` する(ブラウザから `<a href>` で BE 直叩きすると
 * Authorization ヘッダが送られず 401 になるため BFF プロキシパターンを採用)。
 */
export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [workspace, accounts] = await Promise.all([
    fetchWorkspace(slug),
    listTwitterAccounts(slug),
  ]);
  if (!workspace) notFound();

  const canManage = isAdminRole(workspace.role);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Twitter className="text-primary size-4" aria-hidden="true" />X (Twitter) 連携
            </span>
            {canManage && <TwitterConnectButton slug={slug} />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {accounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              連携済みの X アカウントはありません。
              {canManage
                ? '上の「X アカウントを連携」から認可フローを開始してください。'
                : 'OWNER / ADMIN に連携を依頼してください。'}
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="space-y-0.5">
                    <p className="font-medium">@{a.handle}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      連携日 {formatDateTime(a.createdAt)} / トークン有効期限{' '}
                      {formatDateTime(a.expiresAt)}
                    </p>
                  </div>
                  {canManage && (
                    <TwitterDisconnectButton
                      slug={slug}
                      accountId={a.id}
                      handle={a.handle}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground text-xs">
            告知配信は、最も古く連携されたアカウントから自動で投稿されます(MVP)。複数アカウントから選択する UI は今後対応予定です。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
