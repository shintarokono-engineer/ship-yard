import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, FileText } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { InlineEmpty } from '@/components/inline-empty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card';
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { ProjectBreadcrumbs } from '@/components/project-breadcrumbs';
import { isAdminRole, isWriterRole, PROJECT_STATUS_META } from '@/lib/api/types';
import { EMPTY_MESSAGES } from '@/lib/empty-messages';
import { featureHref, PROJECT_FEATURE_META, type ProjectFeature } from '@/lib/project-features';
import {
  fetchDocument,
  fetchProject,
  fetchUsage,
  fetchWorkspace,
  listDocuments,
} from '@/lib/api/workspaces';
import { formatDate, formatDateTime } from '@/lib/format';

import { ProjectActions } from './_components/project-actions';
import { GenerateReadmeDialog } from './readme/_components/generate-readme-dialog';

/** README プレビュー本文の先頭表示文字数(§9.12.4 で Project 詳細にインライン表示)。 */
const README_PREVIEW_CHARS = 200;

/**
 * Markdown 記法を落として本文の «読める先頭» を取り出す。
 *
 * プレビューは 200 字で切るため `MarkdownViewer` に流すと記法の途中で千切れる。
 * かといって生のまま出すと `# 見出し` や `**強調**` が記号ごと見えてしまうので、
 * 行頭記号とインライン装飾だけ剥がしたプレーンテキストにする。
 */
function toPlainPreview(markdown: string, max: number): string {
  const plain = markdown
    .replace(/^\s*```.*$/gm, '') // コードフェンス
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '') // 水平線
    .replace(/^#{1,6}\s+/gm, '') // 見出し
    .replace(/^\s*>\s?/gm, '') // 引用
    .replace(/^\s*[-*+]\s+/gm, '') // 箇条書き
    .replace(/^\s*\d+\.\s+/gm, '') // 番号付きリスト
    .replace(/!\[(.*?)\]\(.*?\)/g, '$1') // 画像
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // リンク
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // 太字
    .replace(/`([^`]+)`/g, '$1') // インラインコード
    .replace(/\n{2,}/g, '\n') // 連続改行を 1 つに
    .trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

/**
 * `/w/{slug}/projects/{projectId}` — プロジェクト詳細ページ。
 *
 * 役割:
 * - プロジェクト情報の表示(名前・概要・状態・各種日付)
 * - 編集 / 削除アクション(ロール別に出し分け、`ProjectActions` に集約)
 * - **README プレビューセクション**(§9.12.4、A1 採用、`/readme/` 単独ページへの導線 + AI 生成 Dialog)
 * - 子リソースのエントリポイント(チェックリスト / 壁打ち / LP / 検証 or 診断)
 *
 * レイアウトは本文(概要・README)+ サイドバー(状態・機能導線)の 2 カラム。
 * 1 カラムで全幅に流していたときは概要 1 行が 70〜80 全角文字になり、日本語の可読行長
 * (35〜45 文字)を大きく超えていた。本文カラム側でさらに `max-w` を掛けて詰める。
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  // layout で workspace の所属チェック済み。fetchWorkspace は React.cache で dedup される。
  const [workspace, project, readmes, usage] = await Promise.all([
    fetchWorkspace(slug),
    fetchProject(slug, projectId),
    listDocuments(slug, projectId, 'README'),
    fetchUsage(slug),
  ]);
  if (!workspace) notFound();
  if (!project) notFound();

  const meta = PROJECT_STATUS_META[project.status];
  const canWrite = isWriterRole(workspace.role);
  const canDelete = isAdminRole(workspace.role);

  // README は append-only 履歴。最新 = version 降順の先頭。
  const sortedReadmes = readmes.toSorted((a, b) => b.version - a.version);
  const latestReadme = sortedReadmes[0] ?? null;

  // 一覧 API(`DOCUMENT_LIST_SELECT`)は `content` を返さない。一覧の戻り値だけで
  // プレビューを組むと本文が常に空になり、「v1(1 件)」 と 「README はまだありません」 が
  // 同時に出る。本文は 1 件取得 API から取り直す。
  //
  // `latestReadme.id` が必要なため上の `Promise.all` には混ぜられず、詳細ページの
  // クリティカルパスに 1 往復増える。減らすなら一覧 API 側に短いプレビュー列を持たせる。
  const latestReadmeWithContent = latestReadme
    ? await fetchDocument(slug, projectId, latestReadme.id)
    : null;
  const readmePreview =
    latestReadmeWithContent?.content && latestReadmeWithContent.content.length > 0
      ? toPlainPreview(latestReadmeWithContent.content, README_PREVIEW_CHARS)
      : null;

  const readmeHref = `/w/${slug}/projects/${projectId}/readme`;

  /*
    ADR-013 改訂版「2 モード化」:
    - status=IDEA       → 「アイデア検証」(IdeaValidation)
    - status=IN_DEV 以降 → 「プロダクト診断」(ServiceScore)
    両者は同時には出さない(機能を分けて UX を明確にする ADR-013 改訂版の意図)。
  */
  const features: { feature: ProjectFeature; badge?: string }[] = [
    { feature: 'CHECKLIST', badge: `${project._count.checklist}` },
    { feature: 'RAG_QA' },
    { feature: 'ANNOUNCEMENT' },
    { feature: 'LANDING_PAGE' },
    { feature: project.status === 'IDEA' ? 'IDEA_VALIDATION' : 'DIAGNOSIS' },
  ];

  return (
    <div className="space-y-6 cursor-default">
      <ProjectBreadcrumbs workspace={workspace} project={project} />

      {/* 狭い幅ではタイトルが潰れるので、操作ボタンを下の行に落とす。 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold break-words">{project.name}</h1>
          <Badge variant={meta.badgeVariant} className={meta.badgeClassName}>
            {meta.label}
          </Badge>
        </div>
        <ProjectActions slug={slug} project={project} canWrite={canWrite} canDelete={canDelete} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* ===== 本文カラム ===== */}
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              {/*
                `CardTitle` は `<div>`(card.tsx)。そのまま使うとページの見出しが h1 だけになり、
                スクリーンリーダーの見出しナビゲーションから概要 / README が消える。
              */}
              <h2 className="text-sm leading-none font-semibold">概要</h2>
            </CardHeader>
            <CardContent>
              {project.description ? (
                // 日本語の可読行長に寄せる。`em` 基準なので text-sm でも文字数が揃う。
                <p className="max-w-[46em] text-sm leading-relaxed whitespace-pre-wrap">
                  {project.description}
                </p>
              ) : (
                <InlineEmpty>
                  {canWrite
                    ? EMPTY_MESSAGES.projectDescription.canWrite
                    : EMPTY_MESSAGES.projectDescription.readOnly}
                </InlineEmpty>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="flex items-center gap-2 text-sm leading-none font-semibold">
                <FileText className="size-4" aria-hidden="true" />
                README
                {latestReadme && (
                  <span className="text-muted-foreground text-xs font-normal">
                    v{latestReadme.version}
                    {sortedReadmes.length > 1 && ` ・ ${sortedReadmes.length} 版`}
                  </span>
                )}
              </h2>
              {canWrite && latestReadme && (
                <CardAction>
                  <ButtonGroup>
                    <Button asChild variant="outline" size="sm">
                      <Link href={readmeHref}>編集 / 履歴</Link>
                    </Button>
                    <GenerateReadmeDialog slug={slug} projectId={projectId} usage={usage} />
                  </ButtonGroup>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {readmePreview ? (
                <>
                  <p className="text-muted-foreground max-w-[46em] text-sm leading-relaxed whitespace-pre-wrap">
                    {readmePreview}
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Link
                      href={readmeHref}
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      全文を見る
                    </Link>
                    {latestReadmeWithContent && (
                      <span className="text-muted-foreground text-xs">
                        更新 {formatDateTime(latestReadmeWithContent.createdAt)}
                      </span>
                    )}
                  </div>
                </>
              ) : latestReadmeWithContent ? (
                /*
                  ドキュメントは存在するが本文が空(タイトルだけの版)。
                  ここで「README はまだありません」 を出すと、ヘッダーの `v1` や
                  `編集 / 履歴` と矛盾し、`AI で生成` が画面に 2 つ出てしまう。
                  README ページ側と同じ `readmeBody` の文言を使う。
                */
                <div className="space-y-3">
                  <InlineEmpty>
                    {canWrite
                      ? EMPTY_MESSAGES.readmeBody.canWrite
                      : EMPTY_MESSAGES.readmeBody.readOnly}
                  </InlineEmpty>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Link
                      href={readmeHref}
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      README を開く
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      更新 {formatDateTime(latestReadmeWithContent.createdAt)}
                    </span>
                  </div>
                </div>
              ) : (
                /* 全画面の空状態と同じ部品を使う。カード内なので余白だけ詰める。 */
                <EmptyState
                  icon={FileText}
                  title="README はまだありません"
                  description={
                    canWrite
                      ? 'プロジェクト情報をもとに AI が下書きを作れます。'
                      : EMPTY_MESSAGES.readme.readOnly
                  }
                  action={
                    canWrite ? (
                      <GenerateReadmeDialog slug={slug} projectId={projectId} usage={usage} />
                    ) : undefined
                  }
                  className="bg-transparent py-8 md:p-8"
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ===== サイドバー ===== */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <Card>
            <CardHeader>
              <h2 className="text-sm leading-none font-semibold">プロジェクト情報</h2>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">状態</dt>
                  <dd>
                    <Badge variant={meta.badgeVariant} className={meta.badgeClassName}>
                      {meta.label}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">作成</dt>
                  <dd className="tabular-nums">{formatDateTime(project.createdAt)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">更新</dt>
                  <dd className="tabular-nums">{formatDateTime(project.updatedAt)}</dd>
                </div>
                {project.launchDate && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">リリース予定</dt>
                    <dd className="tabular-nums">{formatDate(project.launchDate)}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm leading-none font-semibold">機能</h2>
            </CardHeader>
            <CardContent className="px-2">
              <ItemGroup>
                {features.map(({ feature, badge }) => (
                  <FeatureItem
                    key={feature}
                    slug={slug}
                    projectId={projectId}
                    feature={feature}
                    badge={badge}
                  />
                ))}
              </ItemGroup>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/**
 * サイドバーの機能導線 1 行。
 *
 * ラベル・アイコン・遷移先は `PROJECT_FEATURE_META` を唯一の出所とする
 * (機能ページ側の見出しも同じ定数を参照する)。
 *
 * `aria-label` 未指定だと accessible name が「見出し + 件数」の連結になる。
 * 値は可視の見出しと同一文字列にすること(WCAG 2.5.3 Label in Name)。
 */
function FeatureItem({
  slug,
  projectId,
  feature,
  badge,
}: {
  slug: string;
  projectId: string;
  feature: ProjectFeature;
  /** 件数などの補助表示(ラベル右端)。 */
  badge?: string;
}) {
  const meta = PROJECT_FEATURE_META[feature];
  const Icon = meta.icon;

  return (
    <Item asChild size="sm" className="cursor-pointer [&_*]:cursor-pointer">
      <Link href={featureHref(slug, projectId, feature)} aria-label={meta.label}>
        <ItemMedia>
          <Icon className="text-primary size-4" aria-hidden="true" />
        </ItemMedia>
        <ItemContent className="gap-0">
          <ItemTitle className="text-sm font-normal">{meta.label}</ItemTitle>
        </ItemContent>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {badge && <span className="text-muted-foreground text-xs tabular-nums">{badge}</span>}
          {/*
            `Pro` に短縮すると Team プラン(¥2,800/人)の利用者が「自分は対象外」 と読む。
            機能ページ側の `PLAN_LIMITED_NOTE` も「Pro / Team 限定機能です。」 なので表記を揃える。
          */}
          {meta.planLimited && (
            <Badge variant="outline" className="text-[10px] font-normal whitespace-nowrap">
              Pro / Team
            </Badge>
          )}
          <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
        </div>
      </Link>
    </Item>
  );
}
