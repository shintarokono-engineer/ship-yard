import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';

import { ShipyardWordmark } from '@/components/shipyard-logo';

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Link href="/" aria-label="Shipyard ホーム">
        <ShipyardWordmark />
      </Link>
      {/* email/password サインイン後の白紙化を防ぐため、fallback redirect を中間ページに向けて
          フルロード遷移を挟む(`/sign-in-complete` の説明参照)。invite 等で redirect_url が
          明示された場合はそちらが優先されるため、招待承諾フローは従来どおり動く。 */}
      <SignIn fallbackRedirectUrl="/sign-in-complete" />
    </main>
  );
}
