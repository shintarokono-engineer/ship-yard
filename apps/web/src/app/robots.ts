import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/site-url';

/**
 * `/robots.txt`(F10、§9.12.2 観点 10)。
 *
 * 公開すべきは未認証で見せるマーケティング LP(`/`)と公開ランディングページ(`/p/*`)のみ。
 * 認証必須のアプリ内ルートや認証フローはクロール対象から除外する(インデックスされても 302/中身なし)。
 */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/w/', '/onboarding', '/invite/', '/sign-in', '/sign-up', '/sign-out-cleanup'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
