'use client';

import { MessageCirclePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useState } from 'react';

import { FormField } from '@/app/w/[slug]/_shared/form-field';
import { Button } from '@/components/ui/button';
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

import { createSessionAction, type CreateSessionFormState } from '../_actions/create-session';
import {
  INITIAL_CREATE_SESSION_FORM_STATE,
  SESSION_TITLE_MAX_LENGTH,
} from '../_shared/start-session-form';

/**
 * RAG_QA(壁打ち)セッションを新規作成する Dialog。
 *
 * 作成は AI 呼び出しを伴わない軽い操作なので、成功時は Dialog を閉じず
 * そのままチャット画面(`/rag-qa/{sessionId}`)へ遷移する。
 */
export function StartSessionDialog({ slug, projectId }: { slug: string; projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => createSessionAction.bind(null, slug, projectId),
    [slug, projectId],
  );
  const [state, formAction, pending] = useActionState<CreateSessionFormState, FormData>(
    boundAction,
    INITIAL_CREATE_SESSION_FORM_STATE,
  );
  const [titleLength, setTitleLength] = useState(state.title?.length ?? 0);

  // 成功時は作成されたセッションのチャット画面へ遷移する。
  useEffect(() => {
    if (state.ok && state.createdSessionId) {
      router.push(`/w/${slug}/projects/${projectId}/rag-qa/${state.createdSessionId}`);
    }
  }, [state, router, slug, projectId]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <MessageCirclePlus className="size-4" aria-hidden="true" />
          新しい壁打ち
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新しい壁打ちを始める</DialogTitle>
          <DialogDescription>
            このプロジェクトについて AI と相談するセッションを作成します。あとから内容を見返せます。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <FormField
            id="title"
            label="セッションのタイトル"
            required
            counter={{ current: titleLength, max: SESSION_TITLE_MAX_LENGTH }}
            errors={state.fieldError ? [state.fieldError] : undefined}
          >
            <Input
              id="title"
              name="title"
              maxLength={SESSION_TITLE_MAX_LENGTH}
              defaultValue={state.title ?? ''}
              placeholder="例: リリース戦略の壁打ち"
              onChange={(e) => setTitleLength(e.currentTarget.value.length)}
              disabled={pending}
              aria-describedby={state.fieldError ? 'title-error' : undefined}
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
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? '作成中...' : '作成する'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
