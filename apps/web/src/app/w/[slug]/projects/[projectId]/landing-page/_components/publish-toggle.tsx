'use client';

import { EyeOff, Globe } from 'lucide-react';
import { useActionState, useMemo } from 'react';

import { Button } from '@/components/ui/button';

import { togglePublishAction } from '../_actions/toggle-publish';
import {
  INITIAL_TOGGLE_PUBLISH_STATE,
  type TogglePublishState,
} from '../_shared/toggle-publish-state';

/**
 * LP の公開 / 非公開を切り替えるボタン(ADR-009 Day 33)。
 *
 * `published`(現在の公開状態)を見て、押下時に `!published` を目標状態として Server Action を呼ぶ。
 * 成功時は Action 側の `revalidatePath` でプレビューページが再描画され、`published` が反転して渡り直る。
 */
export function PublishToggle({
  slug,
  projectId,
  published,
}: {
  slug: string;
  projectId: string;
  published: boolean;
}) {
  const boundAction = useMemo(
    () => togglePublishAction.bind(null, slug, projectId, !published),
    [slug, projectId, published],
  );
  const [state, formAction, pending] = useActionState<TogglePublishState, FormData>(
    boundAction,
    INITIAL_TOGGLE_PUBLISH_STATE,
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <Button
          type="submit"
          variant={published ? 'outline' : 'default'}
          size="sm"
          className="gap-1.5"
          disabled={pending}
          aria-busy={pending}
        >
          {published ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Globe className="size-4" aria-hidden="true" />
          )}
          {pending ? '更新中...' : published ? '非公開にする' : '公開する'}
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="text-destructive text-xs">
          {state.error}
        </p>
      )}
    </div>
  );
}
