import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

import { TENANT_SLUG_HEADER } from '@/lib/tenant-slug';

// 認証不要なパブリックルート(それ以外は認証必須)
// `/invite/{token}` は未認証ユーザーでも招待内容を確認できる(GitHub / Slack / Notion と同パターン)。
// 承諾(POST)時に認証チェックがかかるため、token 漏洩のリスクは API 側の `User.email === invitation.email`
// 検証で防いでいる(ADR-007)。
// `/p/{slug}/{projectId}` は公開 LP ページ(ADR-009 Day 33)。誰でも閲覧できるべきもので、API 側も
// `publishedAt` がセットされた LP のみ返すため認証不要。
// `/sign-out-cleanup` は Clerk サインアウト後の中間ページ(F1.5、§9.12.2 観点 2)。
// LocalStorage / SessionStorage を cleanup してから `/` にフルロード遷移するため認証不要。
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/sign-out-cleanup',
  '/invite/(.*)',
  '/p/(.*)',
]);

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
    // _next 配下と静的ファイル(拡張子付き)を除外(上のパターンが /api も含めてカバーする)。
    // apps/web は Route Handler(app/**/route.ts)を持たないため Clerk テンプレの `/(api|trpc)(.*)` は削除。
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
