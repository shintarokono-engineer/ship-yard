import { ChevronLeft, LayoutTemplate, Pencil } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LpRenderer } from '@/components/lp-blocks/lp-renderer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isWriterRole } from '@/lib/api/types';
import { fetchLandingPage, fetchProject, fetchWorkspace } from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';

import { GenerateLpDialog } from './_components/generate-lp-dialog';
import { PublishToggle } from './_components/publish-toggle';

/**
 * `/w/{slug}/projects/{projectId}/landing-page` — LP ブロックのプレビュー(ADR-009、Day 31)。
 *
 * `LandingPage.blocks` を `LpRenderer` で実際の見た目に近い形で描画する。LP 未生成なら空状態、
 * 生成済みなら擬似ブラウザフレーム内にプレビューを表示する。生成 / 再生成は WRITER_ROLES のみ
 * (`isWriterRole` で出し分け、API 側でも 403 ガード)。ブロックのテキスト編集は Day 32。
 */
export default async function LandingPagePreviewPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  const workspace = await fetchWorkspace(slug);
  if (!workspace) notFound();

  const project = await fetchProject(slug, projectId);
  if (!project) notFound();

  // プロジェクト存在は上で確認済みのため、ここでの null は「LP 未生成」を意味する。
  const landingPage = await fetchLandingPage(slug, projectId);
  const canWrite = isWriterRole(workspace.role);
  const hasBlocks = !!landingPage && landingPage.blocks.length > 0;

  return (
    <div className="space-y-6 cursor-default">
      <div className="space-y-2">
        <Link
          href={`/w/${slug}/projects/${projectId}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {project.name} の詳細へ戻る
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">ランディングページ</h1>
              {landingPage &&
                (landingPage.publishedAt ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  >
                    公開中
                  </Badge>
                ) : (
                  <Badge variant="secondary">未公開</Badge>
                ))}
            </div>
            <p className="text-muted-foreground text-sm">
              プロジェクト情報から AI がブロック構造の LP を生成し、公開 URL で配信できます。
            </p>
            {landingPage?.publishedAt && (
              <p className="text-sm">
                <span className="text-muted-foreground">公開 URL: </span>
                <Link
                  href={`/p/${slug}/${projectId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  /p/{slug}/{projectId}
                </Link>
              </p>
            )}
          </div>
          {canWrite && landingPage && (
            <div className="flex flex-wrap items-start gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/w/${slug}/projects/${projectId}/landing-page/edit`}>
                  <Pencil className="size-4" aria-hidden="true" />
                  編集
                </Link>
              </Button>
              <GenerateLpDialog slug={slug} projectId={projectId} mode="regenerate" />
              <PublishToggle
                slug={slug}
                projectId={projectId}
                published={!!landingPage.publishedAt}
              />
            </div>
          )}
        </div>
      </div>

      {hasBlocks ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-xl border shadow-sm">
            {/* 公開時の見た目を擬似ブラウザフレームで示す(URL は Day 33 の公開 URL 形式)。 */}
            <div className="bg-muted flex items-center gap-3 border-b px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-red-400/70" />
                <span className="size-2.5 rounded-full bg-amber-400/70" />
                <span className="size-2.5 rounded-full bg-emerald-400/70" />
              </span>
              <span className="bg-background text-muted-foreground mx-auto rounded px-3 py-0.5 text-xs">
                shipyard.app/p/{slug}/{projectId}
              </span>
            </div>
            <LpRenderer blocks={landingPage.blocks} theme={landingPage.theme} headingLevel={2} />
          </div>
          <p className="text-muted-foreground text-xs">
            最終更新 {formatDateTime(landingPage.updatedAt)}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <LayoutTemplate className="text-muted-foreground/60 size-8" aria-hidden="true" />
          <p className="text-muted-foreground text-sm">まだランディングページがありません。</p>
          <p className="text-muted-foreground/70 max-w-sm text-xs">
            {canWrite
              ? 'プロジェクトの概要や状態をもとに、AI がヒーロー・機能紹介・CTA などのブロックを生成します。'
              : '書き込み権限を持つメンバーが生成すると、ここにプレビューが表示されます。'}
          </p>
          {canWrite && (
            <div className="pt-1">
              <GenerateLpDialog slug={slug} projectId={projectId} mode="create" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
