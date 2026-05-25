import { Rocket } from 'lucide-react';

export function EmptyState({ children }: { children?: React.ReactNode }) {
  return (
    <div className="bg-card flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <span className="bg-accent text-primary flex size-12 items-center justify-center rounded-full">
        <Rocket aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-base font-semibold">最初のプロジェクトを作成しましょう</h2>
      <p className="text-muted-foreground max-w-md text-sm">
        アイデアを 1 行で書き留めるところから始められます。あとから AI に README
        やチェックリストを生成させられます。
      </p>
      {children}
    </div>
  );
}
