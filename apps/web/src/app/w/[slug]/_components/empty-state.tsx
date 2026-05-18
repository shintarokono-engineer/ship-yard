import { Rocket } from 'lucide-react';

export function EmptyState({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <Rocket aria-hidden="true" className="text-muted-foreground size-8" />
      <h2 className="text-base font-semibold">最初のプロジェクトを作成しましょう</h2>
      <p className="text-muted-foreground max-w-md text-sm">
        アイデアを 1 行で書き留めるところから始められます。あとから AI に README やチェックリストを生成させられます。
      </p>
      {children}
    </div>
  );
}
