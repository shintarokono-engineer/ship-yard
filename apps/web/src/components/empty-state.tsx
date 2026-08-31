import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

/**
 * 空状態の共通コンポーネント(F4 / §9.12.2 観点 4)。
 *
 * 各機能(プロジェクト一覧 / 壁打ち / 診断 / 検証 / 告知 / LP)の「データがまだ無い」表示を統一する。
 * 地の文だけで足りるカード内・セクション内の空表示は `InlineEmpty` を使う。
 *
 * 中身は shadcn の `Empty` で組む。空状態をこことインラインの 2 系統に収めるため、
 * 呼び出し側が `Empty` を直接使うことはしない。
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
    <Empty className={cn('bg-card gap-3 rounded-xl border border-dashed py-16 md:p-16', className)}>
      <EmptyHeader className="gap-2">
        <EmptyMedia variant="icon" className="bg-accent text-primary size-12 rounded-full">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-base font-semibold">{title}</EmptyTitle>
        {description && <EmptyDescription className="text-sm">{description}</EmptyDescription>}
      </EmptyHeader>

      {(action || hasLinkAction) && (
        <EmptyContent>
          {action}
          {hasLinkAction && (
            <Button asChild size="sm" variant="outline">
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
          )}
        </EmptyContent>
      )}
    </Empty>
  );
}
