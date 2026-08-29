import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 空状態の共通コンポーネント(F4 / §9.12.2 観点 4)。
 *
 * 各機能(プロジェクト一覧 / 壁打ち / 診断 / 検証 / 告知 / LP)の「データがまだ無い」表示を統一する。
 * 地の文だけで足りるカード内・セクション内の空表示は `InlineEmpty` を使う。
 *
 * アクションは下記いずれかで提供:
 *  - `action` に Dialog トリガなどの ReactNode を直接渡す(Client Component 由来のボタン用)
 *  - `actionLabel` + `actionHref` で内部リンクの Button(Link)を出す
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionLabel,
  actionHref,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  className?: string;
}) {
  const hasLinkAction = !action && actionLabel && actionHref;

  return (
    <div
      className={cn(
        'bg-card flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center',
        className,
      )}
    >
      <span className="bg-accent text-primary flex size-12 items-center justify-center rounded-full">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="text-muted-foreground max-w-md text-sm">{description}</p>}
      {action}
      {hasLinkAction && (
        <Button asChild size="sm" variant="outline">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
