'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

/**
 * ワークスペース共通のトップナビゲーション。
 *
 * 主要セクションは「プロジェクト」「設定」の 2 つ。`settings-nav.tsx` と同様に
 * `<Link>` + `usePathname()` で active 判定する。プロジェクトタブは `/projects/...`
 * 配下でも active を維持したいため、「設定配下でなければプロジェクト」とみなす。
 */
export function WorkspaceNav({ slug }: { slug: string }) {
  const pathname = usePathname();

  const projectsHref = `/w/${slug}`;
  const settingsHref = `/w/${slug}/settings`;
  const isSettings = pathname === settingsHref || pathname.startsWith(`${settingsHref}/`);

  const tabs: ReadonlyArray<{ label: string; href: string; isActive: boolean }> = [
    { label: 'プロジェクト', href: projectsHref, isActive: !isSettings },
    { label: '設定', href: settingsHref, isActive: isSettings },
  ];

  return (
    <nav aria-label="ワークスペース">
      <ul className="mx-auto -mb-px flex w-full max-w-6xl gap-1 px-6">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              aria-current={tab.isActive ? 'page' : undefined}
              className={cn(
                'inline-flex items-center border-b-2 px-3 py-2.5 text-sm transition-colors',
                tab.isActive
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
