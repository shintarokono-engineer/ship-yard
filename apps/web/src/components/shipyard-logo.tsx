import { cn } from '@/lib/utils';

/**
 * Shipyard ブランドマーク(帆船)。
 *
 * `fill` は currentColor を継ぐので、配色は親側の `text-*`(indigo / 白抜き)で切り替える。
 * プロダクト識別用のため、アプリ内ヘッダーではなく LP / ログイン / ルートページで使う。
 */
export function ShipyardMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      className={cn('size-6', className)}
    >
      <path d="M17 4v15h11z" />
      <path d="M15 8v11H7z" />
      <path d="M3 21h26c-1.8 5.4-6.6 8-13 8S4.8 26.4 3 21z" />
    </svg>
  );
}

/** マーク +「Shipyard」ワードマークのロックアップ。 */
export function ShipyardWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <ShipyardMark className="text-primary size-7" />
      <span className="text-xl font-semibold tracking-tight">Shipyard</span>
    </span>
  );
}
