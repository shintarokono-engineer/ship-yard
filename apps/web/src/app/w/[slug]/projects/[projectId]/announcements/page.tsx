import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Megaphone } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listAnnouncements } from '@/lib/api/announcements';
import {
  ANNOUNCEMENT_STATUS_META,
  DELIVERY_CHANNEL_META,
  DELIVERY_STATUS_META,
  isWriterRole,
} from '@/lib/api/types';
import { fetchProject, fetchWorkspace } from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';

import { NewAnnouncementDialog } from './_components/new-announcement-dialog';

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

  return (
    <div className="space-y-6 cursor-default">
      <div className="space-y-2">
        <Link
          href={`/w/${slug}/projects/${projectId}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {project.name} へ戻る
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Megaphone className="text-primary size-5" aria-hidden="true" />
              告知
            </h1>
            <p className="text-muted-foreground text-sm">
              AI で多チャネル(X + ブログ)の告知文を生成し、配信状況を管理します。
            </p>
          </div>
          {canWrite && <NewAnnouncementDialog slug={slug} projectId={projectId} />}
        </div>
      </div>

      {announcements.length === 0 ? (
        <div className="border-border rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">
            まだ告知はありません。
            {canWrite && '右上の「告知を作成」から開始してください。'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {announcements.map((a) => {
            const statusMeta = ANNOUNCEMENT_STATUS_META[a.status];
            return (
              <li key={a.id}>
                <Link
                  href={`/w/${slug}/projects/${projectId}/announcements/${a.id}`}
                  className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
                >
                  <Card className="hover:border-primary/40 cursor-pointer transition-all hover:shadow-sm [&_*]:cursor-pointer">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className="truncate">{a.title}</span>
                        <Badge
                          variant={statusMeta.badgeVariant}
                          className={statusMeta.badgeClassName}
                        >
                          {statusMeta.label}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-muted-foreground text-xs">
                        作成 {formatDateTime(a.createdAt)}
                      </p>
                      {a.deliveries.length === 0 ? (
                        <p className="text-muted-foreground/70 text-xs italic">
                          (配信文面は未生成)
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {a.deliveries.map((d) => {
                            const chMeta = DELIVERY_CHANNEL_META[d.channel];
                            const stMeta = DELIVERY_STATUS_META[d.status];
                            return (
                              <span
                                key={d.channel}
                                className="border-border text-foreground/80 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs"
                              >
                                {chMeta.label}
                                <Badge
                                  variant={stMeta.badgeVariant}
                                  className={`${stMeta.badgeClassName ?? ''} text-[10px]`}
                                >
                                  {stMeta.label}
                                </Badge>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
