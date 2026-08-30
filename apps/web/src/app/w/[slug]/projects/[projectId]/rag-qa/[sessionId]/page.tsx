import { notFound } from 'next/navigation';

import { ProjectBreadcrumbs } from '@/components/project-breadcrumbs';
import { isWriterRole } from '@/lib/api/types';
import { fetchProject, fetchRagQaSession, fetchUsage, fetchWorkspace } from '@/lib/api/workspaces';

import { RagQaChatPanel } from './_components/rag-qa-chat-panel';
import { ReflectDescriptionDialog } from './_components/reflect-description-dialog';

/**
 * `/w/{slug}/projects/{projectId}/rag-qa/{sessionId}` — AI 壁打ちのチャット画面。
 *
 * メッセージ履歴は Server Component で取得し、`RagQaChatPanel`(Client)に渡す。
 * 質問送信時は Server Action + `revalidatePath` でこのページが再実行され、履歴が更新される。
 *
 * 会話が 1 件以上ある書き込み権限者には「この会話を概要に反映」を出す。
 */
export default async function RagQaSessionPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; sessionId: string }>;
}) {
  const { slug, projectId, sessionId } = await params;

  const workspace = await fetchWorkspace(slug);
  if (!workspace) notFound();

  const project = await fetchProject(slug, projectId);
  if (!project) notFound();

  const [detail, usage] = await Promise.all([
    fetchRagQaSession(slug, projectId, sessionId),
    fetchUsage(slug),
  ]);
  if (!detail) notFound();

  const canWrite = isWriterRole(workspace.role);

  return (
    <div className="space-y-4 cursor-default">
      <div className="space-y-2">
        <ProjectBreadcrumbs
          workspace={workspace}
          project={project}
          feature="RAG_QA"
          current={detail.session.title}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{detail.session.title}</h1>
          {canWrite && detail.messages.length > 0 && (
            <ReflectDescriptionDialog
              slug={slug}
              projectId={projectId}
              sessionId={sessionId}
              usage={usage}
            />
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {project.name} について AI と相談します。過去のドキュメントを参照して回答します。
        </p>
      </div>

      <RagQaChatPanel
        slug={slug}
        projectId={projectId}
        sessionId={sessionId}
        initialMessages={detail.messages}
        canWrite={canWrite}
        usage={usage}
      />
    </div>
  );
}
