import Link from 'next/link';
import { SignInButton, SignUpButton } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';
import { ShipyardWordmark } from '@/components/shipyard-logo';

const NAV_LINKS = [
  { label: '機能', href: '#features' },
  { label: '使い方', href: '#how-it-works' },
  { label: '料金', href: '#pricing' },
];

/** マーケティング LP の上部ヘッダー。`/` 未認証時のみ描画される(認証済みは page で redirect)。 */
export function SiteHeader() {
  return (
    <header className="bg-card/80 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="Shipyard ホーム">
          <ShipyardWordmark />
        </Link>
        <nav aria-label="セクション" className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm">
              サインイン
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm">無料で始める</Button>
          </SignUpButton>
        </div>
      </div>
    </header>
  );
}
