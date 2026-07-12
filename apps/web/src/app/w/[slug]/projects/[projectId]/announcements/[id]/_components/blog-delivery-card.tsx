'use client';

import { useActionState, useMemo, useState } from 'react';
import { ExternalLink, Newspaper, Pencil, Send } from 'lucide-react';

import { FormField } from '@/app/w/[slug]/_shared/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  BLOG_BODY_MAX,
  BLOG_BODY_MIN,
  BLOG_SLUG_MAX,
  BLOG_TITLE_MAX,
  DELIVERY_STATUS_META,
  type BlogDeliveryContent,
  type BlogPost,
  type Delivery,
} from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';

import { executeDeliveryAction } from '../_actions/execute-delivery';
import { updateBlogPostAction } from '../_actions/update-blog-post';
import {
  INITIAL_EXECUTE_DELIVERY_FORM_STATE,
  type ExecuteDeliveryFormState,
} from '../_shared/execute-delivery-form';
import {
  INITIAL_UPDATE_BLOG_POST_FORM_STATE,
  type UpdateBlogPostFormState,
} from '../_shared/update-blog-post-form';

/**
 * Blog Delivery 表示 + 編集 + 公開実行カード(ADR-014)。
 *
 * - BlogPost(タイトル / 本文 / slug / publishedAt)を表示
 * - 「編集」 Dialog で `updateBlogPostAction` を呼び BlogPost を上書き
 * - 「公開する」ボタンで `executeDeliveryAction` を呼び `publishedAt = now()`
 * - 公開済みなら `/p/:slug/:projectId/blog/:postSlug` への「公開ページを開く」リンクを表示
 */
export function BlogDeliveryCard({
  slug,
  projectId,
  announcementId,
  delivery,
  blogPost,
  canWrite,
}: {
  slug: string;
  projectId: string;
  announcementId: string;
  delivery: Delivery;
  /** Delivery.content.blogPostId に対応する BlogPost。BE 側で fetch して渡す。 */
  blogPost: BlogPost;
  canWrite: boolean;
}) {
  const content = delivery.content as BlogDeliveryContent;
  const stMeta = DELIVERY_STATUS_META[delivery.status];
  const isPublished = blogPost.publishedAt !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Newspaper className="text-primary size-4" aria-hidden="true" />
            ブログ
            <Badge variant={stMeta.badgeVariant} className={stMeta.badgeClassName}>
              {stMeta.label}
            </Badge>
          </span>
          {canWrite && (
            <div className="flex gap-2">
              <EditBlogPostDialog
                slug={slug}
                projectId={projectId}
                announcementId={announcementId}
                blogPost={blogPost}
              />
              {!isPublished && (
                <ExecuteBlogButton
                  slug={slug}
                  projectId={projectId}
                  announcementId={announcementId}
                  deliveryId={delivery.id}
                  disabled={delivery.status === 'SCHEDULED'}
                />
              )}
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{blogPost.title}</h3>
          {content.summary && (
            <p className="text-muted-foreground text-xs italic">概要: {content.summary}</p>
          )}
        </div>
        <details className="text-sm">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
            本文プレビュー({blogPost.body.length.toLocaleString()} 文字)
          </summary>
          <pre className="bg-muted/40 mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md p-3 font-sans text-sm">
            {blogPost.body}
          </pre>
        </details>
        <div className="text-muted-foreground space-y-1 text-xs">
          <p>
            slug: <code className="rounded bg-black/5 px-1 dark:bg-white/10">{blogPost.slug}</code>
          </p>
          {isPublished ? (
            <p className="flex items-center gap-2">
              公開日時 {formatDateTime(blogPost.publishedAt!)}
              <a
                href={`/p/${slug}/${projectId}/blog/${blogPost.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 underline underline-offset-2"
              >
                公開ページを開く
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </p>
          ) : (
            <p>未公開(下書き)</p>
          )}
          {delivery.error && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-2 py-1.5"
            >
              {delivery.error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EditBlogPostDialog({
  slug,
  projectId,
  announcementId,
  blogPost,
}: {
  slug: string;
  projectId: string;
  announcementId: string;
  blogPost: BlogPost;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => updateBlogPostAction.bind(null, slug, projectId, announcementId, blogPost.id),
    [slug, projectId, announcementId, blogPost.id],
  );
  const [state, formAction, pending] = useActionState<UpdateBlogPostFormState, FormData>(
    boundAction,
    INITIAL_UPDATE_BLOG_POST_FORM_STATE,
  );
  const titleRaw = state.fields?.title ?? blogPost.title;
  const bodyRaw = state.fields?.body ?? blogPost.body;
  const slugRaw = state.fields?.slug ?? blogPost.slug;
  const [titleLength, setTitleLength] = useState(titleRaw.length);
  const [bodyLength, setBodyLength] = useState(bodyRaw.length);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.ok && !pending) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="size-3.5" aria-hidden="true" />
          編集
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>ブログ記事を編集</DialogTitle>
          <DialogDescription>
            タイトル / 本文 / slug を編集できます。slug は公開 URL に使われます。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <FormField
            id="title"
            label="タイトル"
            required
            counter={{ current: titleLength, max: BLOG_TITLE_MAX }}
            errors={state.fieldErrors?.title}
          >
            <Input
              id="title"
              name="title"
              maxLength={BLOG_TITLE_MAX}
              defaultValue={titleRaw}
              onChange={(e) => setTitleLength(e.currentTarget.value.length)}
              disabled={pending}
              required
            />
          </FormField>

          <FormField
            id="slug"
            label="slug(URL)"
            required
            errors={state.fieldErrors?.slug}
          >
            <Input
              id="slug"
              name="slug"
              maxLength={BLOG_SLUG_MAX}
              defaultValue={slugRaw}
              placeholder="例: v1-2-release"
              disabled={pending}
              required
            />
          </FormField>

          <FormField
            id="body"
            label="本文(Markdown)"
            required
            counter={{ current: bodyLength, max: BLOG_BODY_MAX }}
            errors={state.fieldErrors?.body}
          >
            <Textarea
              id="body"
              name="body"
              rows={14}
              minLength={BLOG_BODY_MIN}
              maxLength={BLOG_BODY_MAX}
              defaultValue={bodyRaw}
              onChange={(e) => setBodyLength(e.currentTarget.value.length)}
              disabled={pending}
              required
            />
          </FormField>

          {state.formError && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {state.formError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExecuteBlogButton({
  slug,
  projectId,
  announcementId,
  deliveryId,
  disabled,
}: {
  slug: string;
  projectId: string;
  announcementId: string;
  deliveryId: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => executeDeliveryAction.bind(null, slug, projectId, announcementId, deliveryId),
    [slug, projectId, announcementId, deliveryId],
  );
  const [state, formAction, pending] = useActionState<ExecuteDeliveryFormState, FormData>(
    boundAction,
    INITIAL_EXECUTE_DELIVERY_FORM_STATE,
  );

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.ok && !pending) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled} className="gap-1.5">
          <Send className="size-3.5" aria-hidden="true" />
          公開する
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ブログを公開しますか?</DialogTitle>
          <DialogDescription>
            この記事を公開します。公開後は外部ユーザーからもアクセス可能になります。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          {state.formError && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive mb-3 rounded-md border px-3 py-2 text-sm"
            >
              {state.formError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '公開中...' : '公開する'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
