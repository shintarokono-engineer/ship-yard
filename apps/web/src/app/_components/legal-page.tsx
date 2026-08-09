import Link from 'next/link';
import type { ReactNode } from 'react';

import { NeorieWordmark } from '@/components/neorie-logo';
import { LEGAL } from '@/lib/legal';

/**
 * 法的ページ(特商法表記 / プライバシーポリシー)の共通レイアウト。
 *
 * マーケティング LP のヘッダー / フッターは `#features` 等のアンカーを持ち、別ページから
 * 押すと機能しないため使わない。ここでは**トップへ戻る導線だけ**を置く。
 */
export function LegalPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-background min-h-screen">
      <header className="bg-card/80 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <Link href="/" aria-label="Neorie ホーム">
            <NeorieWordmark />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {lead && <p className="text-muted-foreground mt-3 text-sm">{lead}</p>}
        <div className="mt-10 space-y-10">{children}</div>
        <p className="text-muted-foreground mt-16 text-xs">最終改定日: {LEGAL.revisedAt}</p>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            ← トップへ戻る
          </Link>
          <span className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} {LEGAL.serviceName}
          </span>
        </div>
      </footer>
    </div>
  );
}

/** 法的ページ内の 1 セクション。見出しと本文の間隔を揃える。 */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
      <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

/** 「項目 / 内容」の対を並べる表。特商法表記のように定型項目が続く場面で使う。 */
export function LegalTable({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y border-y">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr] sm:gap-6">
          <dt className="text-foreground text-sm font-medium">{row.label}</dt>
          <dd className="text-muted-foreground text-sm leading-relaxed">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
