import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { listMyWorkspaces } from '@/lib/api/workspaces';

import { CtaSection } from './_components/marketing/cta-section';
import { FeaturesSection } from './_components/marketing/features-section';
import { HeroSection } from './_components/marketing/hero-section';
import { HowItWorksSection } from './_components/marketing/how-it-works-section';
import { PricingSection } from './_components/marketing/pricing-section';
import { SiteFooter } from './_components/marketing/site-footer';
import { SiteHeader } from './_components/marketing/site-header';

/**
 * ルート `/`。
 *
 * - 認証済み: 所属する workspace を判定して `/onboarding`(未所属)または最初の `/w/{slug}` へ redirect
 * - 未認証: マーケティングランディングページを表示(Day 40)
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
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <PricingSection />
        <CtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
