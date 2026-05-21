import type { FeaturesBlock } from '@/lib/api/types';

/**
 * LP の features ブロック(主要機能の紹介)。プレビュー(Day 31)と公開ページ(Day 33)で共用。
 *
 * `icon` は AI 由来の短い文字列(絵文字想定)。アイコンライブラリへのマッピングはせず、
 * そのままテキストとして描画する(空なら ✨ で代替)。
 */
export function FeaturesBlockView({ block }: { block: FeaturesBlock }) {
  return (
    <section className="bg-muted/30 px-6 py-20">
      <div className="mx-auto max-w-5xl">
        {block.title && (
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">{block.title}</h2>
        )}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {block.items.map((item, i) => (
            <div key={i} className="bg-card flex flex-col gap-3 rounded-xl border p-6">
              <span
                className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-lg text-xl"
                aria-hidden="true"
              >
                {item.icon || '✨'}
              </span>
              <h3 className="font-semibold">{item.title}</h3>
              {item.body && <p className="text-muted-foreground text-sm">{item.body}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
