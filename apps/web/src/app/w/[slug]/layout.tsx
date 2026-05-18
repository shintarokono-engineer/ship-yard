import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Rocket } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { fetchWorkspace } from '@/lib/api/workspaces';
import { isValidTenantSlug } from '@/lib/tenant-slug';

/**
 * `/w/{slug}/...` 配下の共通レイアウト。
 *
 * 役割:
 * - slug の形式チェック + 所属チェック(未所属 / 不在は 404、ADR-003)
 * - ヘッダー(ワークスペース名・プラン・ユーザーボタン)
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

  const workspace = await fetchWorkspace(slug);
  if (!workspace) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link
            href={`/w/${workspace.slug}`}
            className="flex items-center gap-2 text-sm font-semibold [&_*]:cursor-pointer"
          >
            <Rocket className="size-4" />
            <span>{workspace.name}</span>
            <Badge variant="secondary" className="ml-1 font-mono text-[10px]">
              {workspace.plan}
            </Badge>
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
