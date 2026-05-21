import { UserButton } from '@clerk/nextjs';
import { notFound } from 'next/navigation';

import { fetchWorkspace, listMyWorkspaces } from '@/lib/api/workspaces';
import { isValidTenantSlug } from '@/lib/tenant-slug';

import { WorkspaceSwitcher } from './_components/workspace-switcher';

/**
 * `/w/{slug}/...` 配下の共通レイアウト。
 *
 * 役割:
 * - slug の形式チェック + 所属チェック(未所属 / 不在は 404、ADR-003)
 * - ヘッダー(WS スイッチャー = WS 切替・設定導線、ユーザーボタン)
 *
 * 子ページ側で同じ workspace 情報が欲しい場合は `fetchWorkspace(slug)` を再度呼ぶ(stale 許容)。
 */
export default async function WorkspaceLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;

  if (!isValidTenantSlug(slug)) {
    notFound();
  }

  const [workspace, myWorkspaces] = await Promise.all([
    fetchWorkspace(slug),
    listMyWorkspaces(),
  ]);
  if (!workspace) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <WorkspaceSwitcher current={workspace} workspaces={myWorkspaces} />
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
