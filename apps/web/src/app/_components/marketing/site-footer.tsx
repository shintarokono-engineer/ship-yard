import Link from 'next/link';

import { ShipyardWordmark } from '@/components/shipyard-logo';

/** マーケティング LP のフッター。 */
export function SiteFooter() {
  return (
    <footer className="bg-card border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <ShipyardWordmark />
          <p className="text-muted-foreground text-xs">
            個人開発者と小さなチームのためのプロダクト開発プラットフォーム
          </p>
        </div>
        <nav aria-label="フッター" className="flex items-center gap-6 text-sm">
          <a
            href="#features"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            機能
          </a>
          <a
            href="#pricing"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            料金
          </a>
          <Link
            href="/sign-in"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            サインイン
          </Link>
        </nav>
      </div>
      <div className="border-t py-4">
        <p className="text-muted-foreground text-center text-xs">
          © {new Date().getFullYear()} Shipyard
        </p>
      </div>
    </footer>
  );
}
