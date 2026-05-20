'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

/**
 * 設定画面のタブナビゲーション。
 *
 * URL ベースのタブ(各タブは独立した App Router ルート)なので、shadcn/Radix Tabs ではなく
 * `<Link>` + `usePathname()` で active 判定する自作ナビ。アクセシビリティは標準のリンク挙動に従う。
 */
const TABS: ReadonlyArray<{ key: string; label: string; segment: string }> = [
  { key: 'members', label: 'メンバー', segment: 'members' },
  { key: 'profile', label: 'プロフィール', segment: 'profile' },
  { key: 'billing', label: 'Billing', segment: 'billing' },
  { key: 'usage', label: '利用状況', segment: 'usage' },
];

export function SettingsNav({ slug }: { slug: string }) {
  const pathname = usePathname();

  return (
    <nav className="border-b" aria-label="設定タブ">
      <ul className="flex gap-1 -mb-px">
        {TABS.map((tab) => {
          const href = `/w/${slug}/settings/${tab.segment}`;
          // segment 単位の前方一致(`/settings/members/...` のような子ルートにも対応)
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={tab.key}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center px-4 py-2 text-sm border-b-2 transition-colors',
                  isActive
                    ? 'border-foreground text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
