'use client';

import { Gauge } from 'lucide-react';
import Link from 'next/link';
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
import { Textarea } from '@/components/ui/textarea';

import { runDiagnosisAction, type RunDiagnosisFormState } from '../_actions/run-diagnosis';
import {
  INITIAL_RUN_DIAGNOSIS_FORM_STATE,
  INSTRUCTIONS_MAX_LENGTH,
} from '../_shared/run-diagnosis-form';

/**
 * プロダクト診断を実行する Dialog(PRODUCT_DIAGNOSIS、Sonnet 4 + Web Search Tool)。
 *
 * IN_DEV / BETA / LAUNCHED / ARCHIVED 段階のプロジェクトを対象に、サービスレベルを 5 軸で
 * スコア化する。Pro / Team 限定、約 1〜2 分かかる。
 * 成功時は作成された ServiceScore の結果ページへ遷移する。
 */
export function RunDiagnosisDialog({ slug, projectId }: { slug: string; projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => runDiagnosisAction.bind(null, slug, projectId),
    [slug, projectId],
  );
  const [state, formAction, pending] = useActionState<RunDiagnosisFormState, FormData>(
    boundAction,
    INITIAL_RUN_DIAGNOSIS_FORM_STATE,
  );
  const [length, setLength] = useState(state.instructions?.length ?? 0);

  useEffect(() => {
    if (state.ok && state.createdId) {
      router.push(`/w/${slug}/projects/${projectId}/diagnoses/${state.createdId}`);
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
          <Gauge className="size-4" aria-hidden="true" />
          診断を実行する
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>プロダクト診断を実行する</DialogTitle>
          <DialogDescription>
            プロジェクトのドキュメント・チェックリスト・詳細情報を AI が読み込み、競合データも
            参照しながら 5 軸でスコア化します(Pro / Team 限定、約 1〜2 分かかります)。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <FormField
            id="instructions"
            label="追加の指示(任意)"
            counter={{ current: length, max: INSTRUCTIONS_MAX_LENGTH }}
            errors={state.fieldError ? [state.fieldError] : undefined}
          >
            <Textarea
              id="instructions"
              name="instructions"
              rows={4}
              maxLength={INSTRUCTIONS_MAX_LENGTH}
              defaultValue={state.instructions ?? ''}
              placeholder="例: モバイル UX を重点的に評価 / セキュリティ観点を厳しく"
              onChange={(e) => setLength(e.currentTarget.value.length)}
              disabled={pending}
              aria-describedby={state.fieldError ? 'instructions-error' : undefined}
            />
          </FormField>

          {state.formError && (
            <div
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive space-y-2 rounded-md border px-3 py-2 text-sm"
            >
              <p>{state.formError}</p>
              {state.quotaExceeded && (
                <Link
                  href={`/w/${slug}/settings/billing`}
                  className="text-destructive inline-block text-xs font-medium underline underline-offset-2 hover:no-underline"
                >
                  プランをアップグレード
                </Link>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? '実行中...' : '診断を実行'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
