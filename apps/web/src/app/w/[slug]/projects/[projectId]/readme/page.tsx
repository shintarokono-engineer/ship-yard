import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { MarkdownViewer } from '@/components/markdown-viewer';
import { Badge } from '@/components/ui/badge';
import { isWriterRole } from '@/lib/api/types';
import {
  fetchDocument,
  fetchProject,
  fetchUsage,
  fetchWorkspace,
  listDocuments,
} from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';

import { DeleteReadmeButton } from './_components/delete-readme-button';
import { EditReadmeDialog } from './_components/edit-readme-dialog';
import { GenerateReadmeDialog } from './_components/generate-readme-dialog';
import { RefineReadmeDialog } from './_components/refine-readme-dialog';
import { VersionHistory } from './_components/version-history';

/**
 * `/w/{slug}/projects/{projectId}/readme` — README 単一ページ。
 *
 * §9.12.4(2026-05-29)で旧 `/documents` ページを廃止し、README 1 種に絞った専用ページへ再構成。
 * 最新 version を既定表示し、`?v={versionId}` クエリパラメータで過去 version を表示する
 * (動的ルート `[documentId]` は廃止、append-only 履歴は VersionHistory + searchParams で表現)。
 *
 * - 一覧 API(`listDocuments(..., 'README')`)で全 version を取得し、version 降順で並べる
 * - 未作成(versions.length === 0)時は GenerateReadmeDialog のみを案内し編集系 UI は出さない
 */
export default async function ReadmePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectId: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { slug, projectId } = await params;
  const { v } = await searchParams;

  const [workspace, project, allReadmes, usage] = await Promise.all([
    fetchWorkspace(slug),
    fetchProject(slug, projectId),
    listDocuments(slug, projectId, 'README'),
    fetchUsage(slug),
  ]);
  if (!workspace) notFound();
  if (!project) notFound();

  // 一覧 API は基本降順想定だが、安全のため version 降順に並べ替える(append-only 履歴)。
  const versions = allReadmes.toSorted((a, b) => b.version - a.version);
  const canWrite = isWriterRole(workspace.role);

  // README 未作成:Generate Dialog のみで CTA を出す。
  if (versions.length === 0) {
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
          <h1 className="text-2xl font-semibold">README</h1>
        </div>

        <div className="border-border space-y-3 rounded-lg border border-dashed p-6">
          <p className="text-muted-foreground/70 text-sm italic">(未作成)</p>
          {canWrite && (
            <GenerateReadmeDialog slug={slug} projectId={projectId} usage={usage} />
          )}
        </div>
      </div>
    );
  }

  // searchParams v が指定されていればその version、無ければ最新(version 降順の先頭)。
  const current = v ? versions.find((doc) => doc.id === v) : versions[0];
  if (!current) notFound();

  // 一覧 API は content を含まないため、本文表示用に 1 件取得 API で content を含むエンティティを別途取得する。
  const currentWithContent = await fetchDocument(slug, projectId, current.id);
  if (!currentWithContent) notFound();

  return (
    <div className="space-y-8 cursor-default">
      <div className="space-y-4">
        <Link
          href={`/w/${slug}/projects/${projectId}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {project.name} の詳細へ戻る
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">README</Badge>
              <Badge variant="secondary" className="font-mono text-[10px]">
                v{currentWithContent.version}
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold">{currentWithContent.title}</h1>
            <p className="text-muted-foreground text-xs">
              更新 {formatDateTime(currentWithContent.createdAt)}
            </p>
          </div>

          {canWrite && (
            <div className="flex shrink-0 gap-2">
              <RefineReadmeDialog
                slug={slug}
                projectId={projectId}
                documentId={currentWithContent.id}
                usage={usage}
              />
              <EditReadmeDialog
                slug={slug}
                projectId={projectId}
                document={currentWithContent}
              />
              <DeleteReadmeButton
                slug={slug}
                projectId={projectId}
                document={currentWithContent}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
        <article aria-label="本文">
          {currentWithContent.content && currentWithContent.content.length > 0 ? (
            <MarkdownViewer source={currentWithContent.content} />
          ) : (
            <p className="text-muted-foreground/70 text-sm italic">(本文なし)</p>
          )}
        </article>
        {versions.length > 1 && (
          <VersionHistory
            slug={slug}
            projectId={projectId}
            currentDocumentId={currentWithContent.id}
            versions={versions}
          />
        )}
      </div>
    </div>
  );
}
