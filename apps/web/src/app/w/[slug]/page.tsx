import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { isValidTenantSlug } from '@/lib/tenant-slug';

interface Workspace {
  id: string;
  slug: string;
  name: string;
  plan: string;
  role: string;
}

/**
 * 現在のユーザーがその slug のテナントに所属しているかを apps/api に確認する。
 * - 所属していれば Workspace を返す
 * - slug 不在 / 未所属 / 認証不可 → null(呼び出し側で notFound() する)
 *
 * データアクセスは apps/api 経由(architecture.md: Web=BFF、DB は API のみ)。
 */
async function fetchWorkspace(slug: string): Promise<Workspace | null> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const res = await fetch(`${process.env.API_URL}/workspaces/${slug}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null; // 404(未所属 or 不在)/ 401 等
  return (await res.json()) as Workspace;
}

export default async function WorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // 形式不正な slug は 404(ADR-003)
  if (!isValidTenantSlug(slug)) {
    notFound();
  }

  const workspace = await fetchWorkspace(slug);
  if (!workspace) {
    notFound(); // 所属していない slug は 404(存在の有無を漏らさない、ADR-003)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">{workspace.name}</h1>
      <p className="text-muted-foreground text-sm">
        slug: <code>{workspace.slug}</code> / plan: <code>{workspace.plan}</code> / あなたのロール:{' '}
        <code>{workspace.role}</code>
      </p>
      <p className="text-muted-foreground">
        所属チェックは apps/api 経由(ADR-002 / ADR-003)。ワークスペース内の画面は今後実装します。
      </p>
    </main>
  );
}
