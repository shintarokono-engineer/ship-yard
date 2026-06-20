import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft,
  FileText,
  Gauge,
  LayoutTemplate,
  Lightbulb,
  ListChecks,
  Megaphone,
  MessageCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isAdminRole, isWriterRole, PROJECT_STATUS_META } from '@/lib/api/types';
import { fetchProject, fetchUsage, fetchWorkspace, listDocuments } from '@/lib/api/workspaces';
import { formatDate, formatDateTime } from '@/lib/format';

import { DeleteProjectButton } from './_components/delete-project-button';
import { EditProjectDialog } from './_components/edit-project-dialog';
import { GenerateReadmeDialog } from './readme/_components/generate-readme-dialog';

/** README プレビュー本文の先頭表示文字数(§9.12.4 で Project 詳細にインライン表示)。 */
const README_PREVIEW_CHARS = 200;

/**
 * `/w/{slug}/projects/{projectId}` — プロジェクト詳細ページ。
 *
 * 役割:
 * - プロジェクト情報の表示(名前・概要・状態・各種日付)
 * - 編集 / 削除アクション(ロール別に出し分け)
 * - **README プレビューセクション**(§9.12.4、A1 採用、`/readme/` 単独ページへの導線 + AI 生成 Dialog)
 * - 子リソースのエントリポイント(チェックリスト / 壁打ち / LP / 検証 or 診断)
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
  const readmePreview =
    latestReadme?.content && latestReadme.content.length > 0
      ? latestReadme.content.length > README_PREVIEW_CHARS
        ? `${latestReadme.content.slice(0, README_PREVIEW_CHARS)}…`
        : latestReadme.content
      : null;

  return (
    <div className="space-y-8 cursor-default">
      <div className="space-y-4">
        <Link
          href={`/w/${slug}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          プロジェクト一覧へ戻る
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{project.name}</h1>
              <Badge variant={meta.badgeVariant} className={meta.badgeClassName}>
                {meta.label}
              </Badge>
            </div>
            <dl className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <div className="flex gap-1">
                <dt>作成</dt>
                <dd>{formatDateTime(project.createdAt)}</dd>
              </div>
              <div className="flex gap-1">
                <dt>更新</dt>
                <dd>{formatDateTime(project.updatedAt)}</dd>
              </div>
              {project.launchDate && (
                <div className="flex gap-1">
                  <dt>リリース予定</dt>
                  <dd>{formatDate(project.launchDate)}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="flex shrink-0 gap-2">
            {canWrite && <EditProjectDialog slug={slug} project={project} />}
            {canDelete && <DeleteProjectButton slug={slug} project={project} />}
          </div>
        </div>

        <section aria-labelledby="description-heading" className="space-y-2">
          <h2 id="description-heading" className="text-sm font-medium">
            概要
          </h2>
          {project.description ? (
            <p className="text-foreground/90 whitespace-pre-wrap text-sm">{project.description}</p>
          ) : (
            <p className="text-muted-foreground/70 text-sm italic">(説明なし)</p>
          )}
        </section>

        <section aria-labelledby="readme-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="readme-heading" className="flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4" aria-hidden="true" />
              README
              {latestReadme && (
                <span className="text-muted-foreground text-xs font-normal">
                  v{latestReadme.version} ({sortedReadmes.length} 件)
                </span>
              )}
            </h2>
            {canWrite && (
              <div className="flex shrink-0 gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/w/${slug}/projects/${projectId}/readme`}>
                    {latestReadme ? '編集 / 履歴' : '全文を見る'}
                  </Link>
                </Button>
                <GenerateReadmeDialog slug={slug} projectId={projectId} usage={usage} />
              </div>
            )}
          </div>
          {readmePreview ? (
            <p className="text-foreground/90 whitespace-pre-wrap text-sm leading-relaxed">
              {readmePreview}
            </p>
          ) : (
            <p className="text-muted-foreground/70 text-sm italic">(未作成)</p>
          )}
          {latestReadme && (
            <p className="text-muted-foreground text-xs">
              更新 {formatDateTime(latestReadme.createdAt)}
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href={`/w/${slug}/projects/${projectId}/checklist`}
          className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
        >
          <Card className="hover:border-primary/40 cursor-pointer transition-all hover:shadow-sm [&_*]:cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="text-primary size-4" aria-hidden="true" />
                チェックリスト
                <span className="text-muted-foreground ml-auto text-xs font-normal">
                  {project._count.checklist} 件
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                リリース前に必要な作業をカテゴリ別に管理します。
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link
          href={`/w/${slug}/projects/${projectId}/rag-qa`}
          className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
        >
          <Card className="hover:border-primary/40 cursor-pointer transition-all hover:shadow-sm [&_*]:cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="text-primary size-4" aria-hidden="true" />
                AI 壁打ち
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                プロジェクトの方針や課題を AI と相談します。過去ドキュメントを参照して回答します。
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link
          href={`/w/${slug}/projects/${projectId}/announcements`}
          className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
        >
          <Card className="hover:border-primary/40 cursor-pointer transition-all hover:shadow-sm [&_*]:cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Megaphone className="text-primary size-4" aria-hidden="true" />
                告知
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                X (Twitter) とブログ向けの告知文を AI で一括生成し、配信状況を管理します。
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link
          href={`/w/${slug}/projects/${projectId}/landing-page`}
          className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
        >
          <Card className="hover:border-primary/40 cursor-pointer transition-all hover:shadow-sm [&_*]:cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutTemplate className="text-primary size-4" aria-hidden="true" />
                ランディングページ
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                AI がブロック構造の LP を生成します。アプリ内でプレビューできます。
              </p>
            </CardContent>
          </Card>
        </Link>

        {/*
          ADR-013 改訂版「2 モード化」:
          - status=IDEA       → 「アイデア検証」 Card(IdeaValidation)
          - status=IN_DEV 以降 → 「プロダクト診断」 Card(ServiceScore)
          両 Card は同時には出さない(機能を分けて UX を明確にする ADR-013 改訂版の意図)。
        */}
        {project.status === 'IDEA' ? (
          <Link
            href={`/w/${slug}/projects/${projectId}/idea-validations`}
            className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
          >
            <Card className="hover:border-primary/40 cursor-pointer transition-all hover:shadow-sm [&_*]:cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="text-primary size-4" aria-hidden="true" />
                  アイデア検証
                  <Badge variant="outline" className="ml-auto text-[10px] font-normal">
                    Pro / Team
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  AI が実競合と比較して Go / Pivot / No-Go を判定します。発案段階の方向性検証に。
                </p>
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Link
            href={`/w/${slug}/projects/${projectId}/diagnoses`}
            className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
          >
            <Card className="hover:border-primary/40 cursor-pointer transition-all hover:shadow-sm [&_*]:cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gauge className="text-primary size-4" aria-hidden="true" />
                  プロダクト診断
                  <Badge variant="outline" className="ml-auto text-[10px] font-normal">
                    Pro / Team
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  AI が実競合と比較してプロダクトの実用性を 100 点満点でスコア化します。
                </p>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}
