import { UserButton } from '@clerk/nextjs';
import { notFound } from 'next/navigation';

import { fetchWorkspace, listMyWorkspaces } from '@/lib/api/workspaces';
import { isValidTenantSlug } from '@/lib/tenant-slug';

import { WorkspaceNav } from './_components/workspace-nav';
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

  const [workspace, myWorkspaces] = await Promise.all([fetchWorkspace(slug), listMyWorkspaces()]);
  if (!workspace) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <WorkspaceSwitcher current={workspace} workspaces={myWorkspaces} />
          {/* F1.5(§9.12.2 観点 2):サインアウト後の遷移先(`/sign-out-cleanup` で LocalStorage /
              SessionStorage cleanup + フルロード)は `<ClerkProvider afterSignOutUrl="...">`
              (apps/web/src/app/layout.tsx)に集約。`<UserButton afterSignOutUrl>` は Clerk v6 で
              deprecated のため使わない。Multi-session handling は Clerk Dashboard で OFF に
              設定する前提(Sessions ページ、デフォルト OFF)= 1 ブラウザ 1 セッションで
              `signOut()` 標準動作で全セッション無効化となる。 */}
          <UserButton />
        </div>
        <WorkspaceNav slug={workspace.slug} />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
