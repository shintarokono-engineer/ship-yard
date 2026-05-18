import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { Rocket } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold">Shipyard</h1>
      <p className="text-muted-foreground text-lg">
        Day 4: Next.js 15 + React 19 + Tailwind CSS v4 + shadcn/ui + Clerk 雛形が起動しています。
      </p>

      <div className="flex items-center gap-3">
        <SignedOut>
          <SignInButton mode="modal">
            <Button>
              <Rocket />
              サインイン
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button variant="outline">サインアップ</Button>
          </SignUpButton>
        </SignedOut>
        <SignedIn>
          <span className="text-muted-foreground text-sm">サインイン済み</span>
          <UserButton />
        </SignedIn>
      </div>
    </main>
  );
}
