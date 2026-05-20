import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { DOC_TYPE_META, isWriterRole } from '@/lib/api/types';
import {
  fetchDocument,
  fetchProject,
  fetchWorkspace,
  listDocuments,
} from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';

import { DeleteDocumentButton } from './_components/delete-document-button';
import { EditDocumentDialog } from './_components/edit-document-dialog';
import { MarkdownViewer } from './_components/markdown-viewer';
import { RefineDocumentDialog } from './_components/refine-document-dialog';
import { VersionHistory } from './_components/version-history';

/**
 * `/w/{slug}/projects/{projectId}/documents/{documentId}` — ドキュメント詳細。
 *
 * 本文 markdown 表示 + 編集 / 削除 + 同 type の version 履歴。append-only なので、過去 version の
 * URL も生きており、履歴セクションから別 version に切替表示できる。
 */
export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; documentId: string }>;
}) {
  const { slug, projectId, documentId } = await params;

  const [workspace, project, document] = await Promise.all([
    fetchWorkspace(slug),
    fetchProject(slug, projectId),
    fetchDocument(slug, projectId, documentId),
  ]);
  if (!workspace) notFound();
  if (!project) notFound();
  if (!document) notFound();

  // 同 type の全 version を取得して履歴セクションに渡す(version 降順)。
  const sameTypeAll = await listDocuments(slug, projectId, document.type);
  const versions = sameTypeAll.toSorted((a, b) => b.version - a.version);

  const meta = DOC_TYPE_META[document.type];
  const canWrite = isWriterRole(workspace.role);

  return (
    <div className="space-y-8 cursor-default">
      <div className="space-y-4">
        <Link
          href={`/w/${slug}/projects/${projectId}/documents`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          ドキュメント一覧へ戻る
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{meta.label}</Badge>
              <Badge variant="secondary" className="font-mono text-[10px]">
                v{document.version}
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold">{document.title}</h1>
            <p className="text-muted-foreground text-xs">
              更新 {formatDateTime(document.createdAt)}
            </p>
          </div>

          {canWrite && (
            <div className="flex shrink-0 gap-2">
              <RefineDocumentDialog
                slug={slug}
                projectId={projectId}
                documentId={document.id}
              />
              <EditDocumentDialog slug={slug} projectId={projectId} document={document} />
              <DeleteDocumentButton slug={slug} projectId={projectId} document={document} />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
        <article aria-label="本文">
          {document.content && document.content.length > 0 ? (
            <MarkdownViewer source={document.content} />
          ) : (
            <p className="text-muted-foreground/70 text-sm italic">(本文なし)</p>
          )}
        </article>
        {versions.length > 1 && (
          <VersionHistory
            slug={slug}
            projectId={projectId}
            currentDocumentId={document.id}
            versions={versions}
          />
        )}
      </div>
    </div>
  );
}
