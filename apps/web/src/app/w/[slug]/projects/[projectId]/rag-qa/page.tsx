import { ChevronLeft, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EmptyState } from '@/components/empty-state';
import { isWriterRole } from '@/lib/api/types';
import { fetchProject, fetchWorkspace, listRagQaSessions } from '@/lib/api/workspaces';

import { SessionList } from './_components/session-list';
import { StartSessionDialog } from './_components/start-session-dialog';

/**
 * `/w/{slug}/projects/{projectId}/rag-qa` — AI 壁打ちセッション一覧。
 *
 * セッションは `updatedAt` 降順(最後にやり取りした順)で並ぶ。閲覧は全テナントメンバー、
 * 新規作成は WRITER_ROLES のみ(`isWriterRole` で出し分け、API 側でも 403 ガード)。
 */
export default async function RagQaSessionsPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  // workspace / project はどちらも 404 で null を返すため並列化する。
  const [workspace, project] = await Promise.all([
    fetchWorkspace(slug),
    fetchProject(slug, projectId),
  ]);
  if (!workspace) notFound();
  if (!project) notFound();

  const sessions = await listRagQaSessions(slug, projectId);
  const canWrite = isWriterRole(workspace.role);
  const hasSessions = sessions.items.length > 0;

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
          <div>
            <h1 className="text-2xl font-semibold">AI 壁打ち</h1>
            <p className="text-muted-foreground text-sm">
              プロジェクトについて AI と相談します。過去のドキュメントを参照しながら回答します。
            </p>
          </div>
          {canWrite && <StartSessionDialog slug={slug} projectId={projectId} />}
        </div>
      </div>

      {hasSessions ? (
        <SessionList
          slug={slug}
          projectId={projectId}
          initialItems={sessions.items}
          initialNextCursor={sessions.nextCursor}
        />
      ) : (
        <EmptyState
          icon={MessageCircle}
          title="まだ壁打ちセッションがありません。"
          description={
            canWrite
              ? '「新しい壁打ち」 から AI への相談を始めましょう。'
              : '書き込み権限を持つメンバーがセッションを作成すると、ここに表示されます。'
          }
        />
      )}
    </div>
  );
}
