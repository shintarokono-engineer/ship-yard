import { SettingsNav } from './_components/settings-nav';

/**
 * `/w/{slug}/settings/...` 共通レイアウト。
 *
 * 親 `/w/{slug}/layout.tsx` が所属チェック + 404 を済ませているので、ここでは
 * 4 タブ(メンバー / プロフィール / Billing / 利用状況)のヘッダー + ナビゲーションだけを担う。
 * 各タブごとの role-based UI 出し分けは子ページの責務。
 */
export default async function SettingsLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;

  return (
    <div className="space-y-6 cursor-default">
      <div>
        <h1 className="text-2xl font-semibold">設定</h1>
        <p className="text-muted-foreground text-sm">
          ワークスペースのメンバー・プラン・利用状況を管理します。
        </p>
      </div>

      <SettingsNav slug={slug} />

      <div>{children}</div>
    </div>
  );
}
