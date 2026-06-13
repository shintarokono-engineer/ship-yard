import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 空状態の共通コンポーネント(F4 / §9.12.2 観点 4)。
 *
 * 各機能(壁打ち / 診断 / 検証 / プロジェクト一覧 等)の「データがまだ無い」表示を統一する。
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
        'flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center',
        className,
      )}
    >
      <Icon className="text-muted-foreground/60 size-8" aria-hidden="true" />
      <p className="text-muted-foreground text-sm">{title}</p>
      {description && <p className="text-muted-foreground/70 text-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
      {hasLinkAction && (
        <Button asChild size="sm" variant="outline" className="mt-2">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
