import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { Rocket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { listMyWorkspaces } from '@/lib/api/workspaces';

/**
 * ルート `/`。
 *
 * - 認証済み: 所属する workspace を判定して `/onboarding`(未所属)または最初の `/w/{slug}` へ redirect
 * - 未認証: サインイン / サインアップ導線(暫定 LP、Day 34 で本番 LP に差し替え予定)
 *
 * Clerk の afterSignUpUrl 設定で `/onboarding` に直接飛ばす経路もあるが、再訪問 / 直 URL アクセスの
 * fallback としてこのページでも所属判定を行う。
 */
export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    const workspaces = await listMyWorkspaces();
    const first = workspaces[0];
    if (!first) {
      redirect('/onboarding');
    }
    redirect(`/w/${first.slug}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold">Shipyard</h1>
      <p className="text-muted-foreground text-lg">
        個人開発者・小規模チームのプロダクトリリースを支援する AI 機能付き B2B SaaS。
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
