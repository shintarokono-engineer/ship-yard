import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, FileText, ListChecks, MessageCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isAdminRole, isWriterRole, PROJECT_STATUS_META } from '@/lib/api/types';
import { fetchProject, fetchWorkspace } from '@/lib/api/workspaces';
import { formatDate, formatDateTime } from '@/lib/format';

import { DeleteProjectButton } from './_components/delete-project-button';
import { EditProjectDialog } from './_components/edit-project-dialog';

/**
 * `/w/{slug}/projects/{projectId}` — プロジェクト詳細ページ。
 *
 * 役割:
 * - プロジェクト情報の表示(名前・概要・状態・各種日付)
 * - 編集 / 削除アクション(ロール別に出し分け)
 * - 子リソースのエントリポイント(ドキュメント / チェックリスト)
 *
 * ドキュメント / チェックリストの **中身は Day 21 / Day 20 で実装** する。
 * 本ページでは件数表示 + プレースホルダーのみ。
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  // layout で workspace の所属チェック済み。fetchWorkspace は React.cache で dedup される。
  const workspace = await fetchWorkspace(slug);
  if (!workspace) notFound();

  const project = await fetchProject(slug, projectId);
  if (!project) notFound();

  const meta = PROJECT_STATUS_META[project.status];
  const canWrite = isWriterRole(workspace.role);
  const canDelete = isAdminRole(workspace.role);

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
            <p className="text-foreground/90 whitespace-pre-wrap text-sm">
              {project.description}
            </p>
          ) : (
            <p className="text-muted-foreground/70 text-sm italic">(説明なし)</p>
          )}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href={`/w/${slug}/projects/${projectId}/documents`}
          className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
        >
          <Card className="hover:bg-accent/30 cursor-pointer transition-colors [&_*]:cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" aria-hidden="true" />
                ドキュメント
                <span className="text-muted-foreground ml-auto text-xs font-normal">
                  {project._count.documents} 件
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                README / ランディングページ / 告知文などを AI と一緒に作ります。
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link
          href={`/w/${slug}/projects/${projectId}/checklist`}
          className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
        >
          <Card className="hover:bg-accent/30 cursor-pointer transition-colors [&_*]:cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="size-4" aria-hidden="true" />
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
          <Card className="hover:bg-accent/30 cursor-pointer transition-colors [&_*]:cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="size-4" aria-hidden="true" />
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
      </div>
    </div>
  );
}
