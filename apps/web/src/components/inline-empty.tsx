import { cn } from '@/lib/utils';

/**
 * インライン空状態(カード内・セクション内の「まだ何も無い」表示)。
 *
 * 全画面版の `EmptyState`(アイコン + 説明 + CTA)と対になる軽量版。
 * 従来は `(説明なし)` のような括弧書きを斜体の淡色で置いていたが、
 * システムの null 表示に見えるうえ、全画面版との品質差が目立っていた。
 *
 * 使う側の約束:
 * - 文言は `lib/empty-messages.ts` から取る(トーンを 1 箇所で揃えるため)
 * - 括弧書き・体言止めにしない。否定で終わらせず次の一手を添える
 * - 書き込み権限が無い閲覧者には操作を促さない(`EMPTY_MESSAGES` の readOnly 側を使う)
 */
export function InlineEmpty({
  children,
  size = 'sm',
  className,
}: {
  children: React.ReactNode;
  size?: 'sm' | 'xs';
  className?: string;
}) {
  return (
    <p className={cn('text-muted-foreground', size === 'xs' ? 'text-xs' : 'text-sm', className)}>
      {children}
    </p>
  );
}
