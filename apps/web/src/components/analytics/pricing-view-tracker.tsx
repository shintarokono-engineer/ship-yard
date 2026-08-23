'use client';

import { useEffect, useRef } from 'react';

import { trackPricingViewed } from '@/lib/analytics';

/**
 * 料金セクションが画面内に入ったら `pricing_viewed` を送る番兵要素。セクション自体は
 * Server Component なので、内部にこの高さゼロの Client 要素を置いて監視する。
 * 1 セッション 1 回の抑制は `lib/analytics.ts` 側が担当する。
 */
export function PricingViewTracker() {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        trackPricingViewed();
        // スクロールで往復しても再発火させない。
        observer.disconnect();
      },
      // 端が 1px 入っただけで「見た」と数えないよう、実際に読める程度に入ってから発火する。
      { threshold: 0, rootMargin: '0px 0px -20% 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <div ref={sentinelRef} aria-hidden="true" />;
}
