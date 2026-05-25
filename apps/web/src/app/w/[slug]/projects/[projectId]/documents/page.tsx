import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, FileText } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DOC_TYPES,
  DOC_TYPE_META,
  type DocType,
  type ProjectDocument,
  isGeneratableDocType,
  isWriterRole,
} from '@/lib/api/types';
import { fetchProject, fetchWorkspace, listDocuments } from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';

import { GenerateDocumentDialog } from './_components/generate-document-dialog';

/**
 * `/w/{slug}/projects/{projectId}/documents` — ドキュメント一覧。
 *
 * 全 DocType(README / LP / RELEASE_BLOG / TWEET / PRODUCT_HUNT / EMAIL / OTHER)を縦に並べ、
 * 各 type の最新 version のカードを表示する。クリックで詳細ページへ。
 * 未作成 type は破線カードで表示し、AI 生成対応(OTHER / LANDING_PAGE 以外の 5 種)は「AI で生成」ボタンを置く。
 * LP は ADR-009 で LandingPage テーブル + ブロック生成へ移行したため AI 生成対象外。
 */
export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  const [workspace, project, documents] = await Promise.all([
    fetchWorkspace(slug),
    fetchProject(slug, projectId),
    listDocuments(slug, projectId),
  ]);
  if (!workspace) notFound();
  if (!project) notFound();

  const canWrite = isWriterRole(workspace.role);

  // 同 type で複数 version が返るので、type ごとに version 最大を最新として抽出。
  const latestByType = new Map<DocType, ProjectDocument>();
  for (const doc of documents) {
    const existing = latestByType.get(doc.type);
    if (!existing || doc.version > existing.version) {
      latestByType.set(doc.type, doc);
    }
  }

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
        <h1 className="text-2xl font-semibold">ドキュメント</h1>
        <p className="text-muted-foreground text-sm">
          README / ランディングページ / 告知文などをカテゴリ別に管理します。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {DOC_TYPES.map((type) => {
          const latest = latestByType.get(type);
          const meta = DOC_TYPE_META[type];
          if (latest) {
            return (
              <Link
                key={type}
                href={`/w/${slug}/projects/${projectId}/documents/${latest.id}`}
                className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
              >
                <Card className="hover:bg-accent/30 h-full cursor-pointer transition-colors [&_*]:cursor-pointer">
                  <CardHeader className="gap-2">
                    <CardTitle className="flex items-start justify-between gap-2 text-base">
                      <span className="flex items-center gap-2">
                        <FileText className="size-4" aria-hidden="true" />
                        {meta.label}
                      </span>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        v{latest.version}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium">{latest.title}</p>
                    <p className="text-muted-foreground mt-1 text-xs">{meta.description}</p>
                  </CardContent>
                  <CardFooter className="text-muted-foreground text-xs">
                    更新 {formatDateTime(latest.createdAt)}
                  </CardFooter>
                </Card>
              </Link>
            );
          }
          return (
            <Card key={type} className="border-dashed">
              <CardHeader className="gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="text-muted-foreground/60 size-4" aria-hidden="true" />
                  <span className="text-muted-foreground">{meta.label}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground/70 text-sm italic">(未作成)</p>
                <p className="text-muted-foreground mt-1 text-xs">{meta.description}</p>
              </CardContent>
              <CardFooter className="text-muted-foreground/70 text-xs">
                {canWrite && isGeneratableDocType(type) ? (
                  <GenerateDocumentDialog
                    slug={slug}
                    projectId={projectId}
                    docType={type}
                    typeLabel={meta.label}
                  />
                ) : (
                  <span>この種別は AI 生成に非対応です</span>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
