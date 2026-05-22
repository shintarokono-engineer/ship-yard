import {
  LayoutGrid,
  LayoutTemplate,
  ListChecks,
  MessageCircle,
  Sparkles,
  Users,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Sparkles,
    title: 'AI ドキュメント生成',
    body: 'README・告知文・プロジェクト概要を Claude が下書き。推敲もワンクリックで。',
  },
  {
    icon: LayoutTemplate,
    title: 'ランディングページ作成',
    body: 'ブロック構造の LP を AI が生成。アプリ内で編集して、公開 URL まで完結します。',
  },
  {
    icon: ListChecks,
    title: 'リリースチェックリスト',
    body: 'AI がカテゴリ別のリリースタスクを生成。大きな作業はサブタスクに分解します。',
  },
  {
    icon: MessageCircle,
    title: 'AI 壁打ち',
    body: '過去のドキュメントを参照(RAG)して、プロジェクトの方針や課題に答えます。',
  },
  {
    icon: Users,
    title: 'チームで協働',
    body: '6 段階のロール権限、招待リンク、監査ログ。2〜10 人のチームに最適です。',
  },
  {
    icon: LayoutGrid,
    title: 'ワークスペース管理',
    body: 'プロジェクトをワークスペース単位で整理。マルチテナント設計で安全に分離します。',
  },
];

/** 主要機能の紹介セクション。 */
export function FeaturesSection() {
  return (
    <section id="features" className="bg-card scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-primary text-sm font-semibold">FEATURES</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            リリースに必要なものを、ひとつに
          </h2>
          <p className="text-muted-foreground mt-4 text-pretty">
            ドキュメントからチェックリスト、ランディングページまで。プロダクトを世に出すための機能が揃っています。
          </p>
        </div>
        <div className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <span className="bg-accent text-primary flex size-11 items-center justify-center rounded-lg">
                <feature.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground mt-2 text-sm text-pretty">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
