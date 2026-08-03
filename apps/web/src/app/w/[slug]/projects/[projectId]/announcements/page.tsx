import { notFound } from 'next/navigation';

import { ProjectBreadcrumbs } from '@/components/project-breadcrumbs';
import { listAnnouncements } from '@/lib/api/announcements';
import { isWriterRole } from '@/lib/api/types';
import { featurePageDescription, PROJECT_FEATURE_META } from '@/lib/project-features';
import { fetchProject, fetchWorkspace } from '@/lib/api/workspaces';

import { AnnouncementList } from './_components/announcement-list';
import { NewAnnouncementDialog } from './_components/new-announcement-dialog';

const AnnouncementIcon = PROJECT_FEATURE_META.ANNOUNCEMENT.icon;

/**
 * `/w/{slug}/projects/{projectId}/announcements` — 告知一覧(ADR-014)。
 *
 * 一覧 + 新規作成 Dialog のみのシンプルな構成。
 * 詳細 / 編集 / AI 生成 / Delivery 実行はすべて `/announcements/{id}` で扱う。
 */
export default async function AnnouncementsPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;
  const [workspace, project, announcements] = await Promise.all([
    fetchWorkspace(slug),
    fetchProject(slug, projectId),
    listAnnouncements(slug, projectId),
  ]);
  if (!workspace) notFound();
  if (!project) notFound();

  const canWrite = isWriterRole(workspace.role);
  const hasAnnouncements = announcements.items.length > 0;

  return (
    <div className="space-y-6 cursor-default">
      <div className="space-y-2">
        <ProjectBreadcrumbs workspace={workspace} project={project} feature="ANNOUNCEMENT" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <AnnouncementIcon className="text-primary size-5" aria-hidden="true" />
              {PROJECT_FEATURE_META.ANNOUNCEMENT.label}
            </h1>
            <p className="text-muted-foreground text-sm">
              {featurePageDescription('ANNOUNCEMENT')}
            </p>
          </div>
          {canWrite && <NewAnnouncementDialog slug={slug} projectId={projectId} />}
        </div>
      </div>

      {hasAnnouncements ? (
        <AnnouncementList
          slug={slug}
          projectId={projectId}
          initialItems={announcements.items}
          initialNextCursor={announcements.nextCursor}
        />
      ) : (
        <div className="border-border rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">
            まだ告知はありません。
            {canWrite && '右上の「告知を作成」から開始してください。'}
          </p>
        </div>
      )}
    </div>
  );
}
