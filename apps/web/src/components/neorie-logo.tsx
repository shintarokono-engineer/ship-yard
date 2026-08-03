import { cn } from '@/lib/utils';

/**
 * Neorie ブランドマーク(負の空間で頭文字 N を抜いた角丸スクエア)。
 *
 * **ワードマーク(`NeorieWordmark`)がブランドの顔で、こちらは補助**という位置づけ。
 * ファビコン / アプリアイコン / OG 画像のように「文字を置けない小さな正方形」でのみ使う。
 *
 * 抽象図形(上昇するバー、成長曲線 等)を避けて頭文字にしたのは意図的:
 * 単純な幾何学マークは他サービスと偶発的に一致しやすく、Shipyard で名前の衝突に
 * 苦労した経緯を視覚面で繰り返さないため。
 *
 * `fill` は currentColor を継ぐので、配色は親側の `text-*` で切り替える。
 */
export function NeorieMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      className={cn('size-6', className)}
    >
      {/* 外周の塗り面から N を刳り抜く(evenodd)。塗りではなく空白が字を作る。 */}
      <path fillRule="evenodd" d="M4 4h24v24H4V4zm5 4v16h3.5v-9.6l7 9.6H23V8h-3.5v9.6L12.5 8H9z" />
    </svg>
  );
}

/**
 * Neorie ワードマーク(文字のみ)。**ブランドの顔はこちら。**
 *
 * シンボルを持たない構成(Stripe / 初期 Linear と同じ考え方)。ロゴマークとの
 * 偶発的な衝突リスクを構造的に負わず、`Neorie` という綴り自体を識別子にする。
 * 書体は見出しと同じ `font-display`(Geist)を使い、字間を詰めて塊として見せる。
 */
export function NeorieWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display text-xl font-semibold tracking-tight', className)}>
      Neorie
    </span>
  );
}
