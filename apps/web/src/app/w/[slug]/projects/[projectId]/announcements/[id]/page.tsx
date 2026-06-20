import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Megaphone } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { fetchAnnouncement } from '@/lib/api/announcements';
import { fetchBlogPost } from '@/lib/api/blog-posts';
import {
  ANNOUNCEMENT_STATUS_META,
  isWriterRole,
  type BlogDeliveryContent,
  type BlogPost,
} from '@/lib/api/types';
import { fetchProject, fetchUsage, fetchWorkspace } from '@/lib/api/workspaces';
import { formatDateTime } from '@/lib/format';

import { BlogDeliveryCard } from './_components/blog-delivery-card';
import { DeleteAnnouncementButton } from './_components/delete-announcement-button';
import { EditAnnouncementTitleDialog } from './_components/edit-title-dialog';
import { GenerateAnnouncementDialog } from './_components/generate-announcement-dialog';
import { TwitterDeliveryCard } from './_components/twitter-delivery-card';

/**
 * `/w/{slug}/projects/{projectId}/announcements/{id}` — 告知詳細 / 編集ページ(ADR-014)。
 *
 * - タイトル + 状態 + 削除 + AI 生成 Dialog をヘッダに配置
 * - 各 Delivery(TWITTER / BLOG)を別カードで表示し、編集 + 配信実行を即時に行う
 * - BlogPost は Delivery.content.blogPostId から fetch して BlogDeliveryCard に渡す
 */
export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; id: string }>;
}) {
  const { slug, projectId, id } = await params;
  const [workspace, project, announcement, usage] = await Promise.all([
    fetchWorkspace(slug),
    fetchProject(slug, projectId),
    fetchAnnouncement(slug, projectId, id),
    fetchUsage(slug),
  ]);
  if (!workspace) notFound();
  if (!project) notFound();
  if (!announcement) notFound();

  const canWrite = isWriterRole(workspace.role);
  const statusMeta = ANNOUNCEMENT_STATUS_META[announcement.status];

  const twitterDelivery = announcement.deliveries.find((d) => d.channel === 'TWITTER');
  const blogDelivery = announcement.deliveries.find((d) => d.channel === 'BLOG');

  // BlogPost は Delivery.content.blogPostId から fetch する(BE 側で別 entity)。
  // 既存テンプレートと違い fetchBlogPost には id が必要なので、Delivery が無い場合はスキップ。
  let blogPost: BlogPost | null = null;
  if (blogDelivery) {
    const content = blogDelivery.content as BlogDeliveryContent;
    if (typeof content?.blogPostId === 'string') {
      blogPost = await fetchBlogPost(slug, projectId, content.blogPostId);
    }
  }

  return (
    <div className="space-y-6 cursor-default">
      <div className="space-y-2">
        <Link
          href={`/w/${slug}/projects/${projectId}/announcements`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          告知一覧へ戻る
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                <Megaphone className="text-primary size-5" aria-hidden="true" />
                {announcement.title}
              </h1>
              <Badge variant={statusMeta.badgeVariant} className={statusMeta.badgeClassName}>
                {statusMeta.label}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              作成 {formatDateTime(announcement.createdAt)}
              {announcement.updatedAt !== announcement.createdAt &&
                ` / 更新 ${formatDateTime(announcement.updatedAt)}`}
            </p>
          </div>
          {canWrite && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <EditAnnouncementTitleDialog
                slug={slug}
                projectId={projectId}
                id={announcement.id}
                currentTitle={announcement.title}
              />
              <GenerateAnnouncementDialog
                slug={slug}
                projectId={projectId}
                id={announcement.id}
                usage={usage}
                hasExistingDeliveries={announcement.deliveries.length > 0}
              />
              <DeleteAnnouncementButton
                slug={slug}
                projectId={projectId}
                id={announcement.id}
                title={announcement.title}
              />
            </div>
          )}
        </div>
      </div>

      {announcement.deliveries.length === 0 ? (
        <div className="border-border rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">
            まだ配信文面は生成されていません。
            {canWrite && '右上の「AI で文面を生成」を押して開始してください。'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {twitterDelivery && (
            <TwitterDeliveryCard
              slug={slug}
              projectId={projectId}
              announcementId={announcement.id}
              delivery={twitterDelivery}
              canWrite={canWrite}
            />
          )}
          {blogDelivery && blogPost && (
            <BlogDeliveryCard
              slug={slug}
              projectId={projectId}
              announcementId={announcement.id}
              delivery={blogDelivery}
              blogPost={blogPost}
              canWrite={canWrite}
            />
          )}
          {blogDelivery && !blogPost && (
            <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
              ブログ配信のデータ整合性が崩れています。AI で再生成してください。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
