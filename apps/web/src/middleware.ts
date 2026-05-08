import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

import { TENANT_SLUG_HEADER } from '@/lib/tenant-slug';

// 認証不要なパブリックルート(それ以外は認証必須)
const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)']);

// /w/{slug}/... の slug を抽出(形式チェックはページ側で実施)
const TENANT_PATH_REGEX = /^\/w\/([^/]+)/;

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  // ADR-003: /w/{slug}/... に対して slug を抽出し下流へヘッダー伝搬
  const match = req.nextUrl.pathname.match(TENANT_PATH_REGEX);
  if (match) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(TENANT_SLUG_HEADER, match[1]!);
    return NextResponse.next({ request: { headers: requestHeaders } });
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
