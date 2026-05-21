import type { StatsBlock } from '@/lib/api/types';

/** LP の stats ブロック(数値アピール)。プレビュー(Day 31)と公開ページ(Day 33)で共用。 */
export function StatsBlockView({ block }: { block: StatsBlock }) {
  return (
    <section className="bg-background px-6 py-16">
      <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-x-16 gap-y-10">
        {block.items.map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-1 text-center">
            <span className="text-4xl font-bold tracking-tight sm:text-5xl">{item.value}</span>
            <span className="text-muted-foreground text-sm">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
