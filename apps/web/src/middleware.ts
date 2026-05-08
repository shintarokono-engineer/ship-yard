import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// 認証不要なパブリックルート(それ以外は認証必須)
const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // _next 配下と静的ファイル(拡張子付き)を除外
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // ただし API ルートは常に middleware を通す
    '/(api|trpc)(.*)',
  ],
};
