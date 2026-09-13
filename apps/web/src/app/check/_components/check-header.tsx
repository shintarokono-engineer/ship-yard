import Link from 'next/link';

import { CtaSignInButton, CtaSignUpButton } from '@/components/analytics/cta-buttons';
import { NeorieWordmark } from '@/components/neorie-logo';
import { Separator } from '@/components/ui/separator';

/** `/check` の上部ヘッダー。LP と違いセクション nav を持たず、ツール名と認証導線だけを置く。 */
export function CheckHeader() {
  return (
    <header className="bg-card/80 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Neorie ホーム">
            <NeorieWordmark />
          </Link>
          <Separator orientation="vertical" className="hidden h-5 sm:block" />
          <span className="text-muted-foreground hidden text-sm sm:inline">アイデア評価ツール</span>
        </div>
        <div className="flex items-center gap-2">
          <CtaSignInButton location="header" label="サインイン" size="sm" variant="ghost" />
          <CtaSignUpButton location="header" label="無料で始める" size="sm" />
        </div>
      </div>
    </header>
  );
}
