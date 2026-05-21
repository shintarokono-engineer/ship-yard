import type { FooterBlock } from '@/lib/api/types';

import { safeHref } from './safe-href';

/** LP の footer ブロック(任意)。プレビュー(Day 31)と公開ページ(Day 33)で共用。 */
export function FooterBlockView({ block }: { block: FooterBlock }) {
  return (
    <footer className="bg-background border-t px-6 py-10">
      <div className="text-muted-foreground mx-auto flex max-w-5xl flex-col items-center gap-4 text-sm sm:flex-row sm:justify-between">
        {block.copyright && <span>{block.copyright}</span>}
        {block.links.length > 0 && (
          <nav className="flex flex-wrap justify-center gap-4">
            {block.links.map((link, i) => (
              <a
                key={i}
                href={safeHref(link.href)}
                className="hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}
      </div>
    </footer>
  );
}
