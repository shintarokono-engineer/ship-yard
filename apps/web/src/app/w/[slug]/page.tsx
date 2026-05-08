import { notFound } from 'next/navigation';

import { isValidTenantSlug } from '@/lib/tenant-slug';

export default async function WorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // 形式不正な slug は 404(存在の有無を漏らさない、ADR-003)
  if (!isValidTenantSlug(slug)) {
    notFound();
  }

  // TODO(Day 5): DB から Tenant を引き、現在のユーザーが TenantMember であることを
  // 確認する。所属していなければ notFound() で 404(ADR-003)。

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Workspace: {slug}</h1>
      <p className="text-muted-foreground">
        Day 4: ワークスペースルーティング雛形が動いています。所属チェックは Day 5(Prisma + tenant
        解決)で実装します。
      </p>
    </main>
  );
}
