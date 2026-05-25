import { SignInButton, SignUpButton } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';

/** ファーストビュー。見出し + CTA + アプリのプレビューモック。 */
export function HeroSection() {
  return (
    <section className="from-accent/60 to-background bg-linear-to-b">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="border-primary/20 bg-card text-primary mb-6 inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium">
            個人開発者 & 2〜10 人のチームのために
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            アイデアからリリースまで、一直線に。
          </h1>
          <p className="text-muted-foreground mt-6 max-w-2xl text-lg text-pretty">
            Shipyard は個人開発者と小さなチームのためのプロダクト開発プラットフォーム。AI
            がドキュメント・ランディングページ・チェックリスト作成を支え、リリースまでの道のりを短くします。
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <SignUpButton mode="modal">
              <Button size="lg">無料で始める</Button>
            </SignUpButton>
            <SignInButton mode="modal">
              <Button size="lg" variant="outline">
                サインイン
              </Button>
            </SignInButton>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            クレジットカード不要 — 無料プランですぐに開始できます
          </p>
        </div>
        <AppPreview />
      </div>
    </section>
  );
}

/** アプリ画面のイメージを伝える装飾モック(実スクリーンショットではない)。 */
function AppPreview() {
  return (
    <div
      aria-hidden="true"
      className="bg-card mx-auto mt-16 max-w-4xl overflow-hidden rounded-xl border shadow-xl"
    >
      <div className="bg-muted/40 flex items-center gap-2 border-b px-4 py-3">
        <span className="bg-muted-foreground/20 size-3 rounded-full" />
        <span className="bg-muted-foreground/20 size-3 rounded-full" />
        <span className="bg-muted-foreground/20 size-3 rounded-full" />
      </div>
      <div className="p-6">
        <div className="mb-5 flex items-center gap-4 border-b">
          <span className="text-primary border-primary border-b-2 pb-2.5 text-sm font-medium">
            プロジェクト
          </span>
          <span className="text-muted-foreground pb-2.5 text-sm">設定</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { name: 'ランチャー LP', status: '公開準備' },
            { name: 'モバイルアプリ', status: '開発中' },
            { name: 'OSS ライブラリ', status: 'リリース済' },
          ].map((project) => (
            <div key={project.name} className="bg-background rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{project.name}</span>
                <span className="bg-accent text-primary rounded-full px-2 py-0.5 text-[10px] font-medium">
                  {project.status}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="bg-muted h-2 w-full rounded-full" />
                <div className="bg-muted h-2 w-4/5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
