import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';

import { ShipyardWordmark } from '@/components/shipyard-logo';

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Link href="/" aria-label="Shipyard ホーム">
        <ShipyardWordmark />
      </Link>
      <SignUp />
    </main>
  );
}
