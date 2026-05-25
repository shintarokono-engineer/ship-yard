import { redirect } from 'next/navigation';

/**
 * `/w/{slug}/settings` の素のアクセスは `/settings/members` に飛ばす。
 *
 * 設定タブのデフォルトは「メンバー」。タブナビ上でも先頭に置いてある。
 */
export default async function SettingsIndexPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/w/${slug}/settings/members`);
}
