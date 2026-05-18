'use client';

import { useActionState, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS_META, PROJECT_STATUSES } from '@/lib/api/types';

import {
  createProjectAction,
  type CreateProjectFormState,
} from '../_actions/create-project';

const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 20_000;

// 初期値は `'use server'` ファイルから export できないのでコンシューマ側で定義する。
const INITIAL_STATE: CreateProjectFormState = { ok: false };

export function NewProjectDialog({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(() => createProjectAction.bind(null, slug), [slug]);
  const [state, formAction, pending] = useActionState<CreateProjectFormState, FormData>(
    boundAction,
    INITIAL_STATE,
  );

  const initialName = state.fields?.name ?? '';
  const initialDescription = state.fields?.description ?? '';
  const [nameLength, setNameLength] = useState(initialName.length);
  const [descriptionLength, setDescriptionLength] = useState(initialDescription.length);

  const nameErrors = state.fieldErrors?.name;
  const descriptionErrors = state.fieldErrors?.description;
  const statusErrors = state.fieldErrors?.status;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          新規プロジェクト
        </Button>
      </DialogTrigger>
      {/* 内容が長いときに画面高を超えないよう、最大高 90vh + 内側スクロールに */}
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 pb-4">
          <DialogTitle>新規プロジェクト</DialogTitle>
          <DialogDescription>
            名前と概要を入力してください。あとから編集できます。
          </DialogDescription>
        </DialogHeader>

        {/* noValidate でブラウザ既定のバリデーション吹き出しを抑制し、サーバー側の
            検証結果(フィールド直下 / フォーム全体)に表示を一本化する */}
        <form
          action={formAction}
          noValidate
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <FormField
              id="name"
              label="名前"
              required
              counter={{ current: nameLength, max: NAME_MAX_LENGTH }}
              errors={nameErrors}
            >
              <Input
                id="name"
                name="name"
                required
                aria-required="true"
                aria-invalid={nameErrors && nameErrors.length > 0 ? 'true' : undefined}
                aria-describedby={
                  nameErrors && nameErrors.length > 0 ? 'name-error' : undefined
                }
                maxLength={NAME_MAX_LENGTH}
                placeholder="例: roadster-cost-tracker"
                defaultValue={initialName}
                onChange={(e) => setNameLength(e.currentTarget.value.length)}
              />
            </FormField>

            <FormField
              id="description"
              label="概要(Markdown 可)"
              counter={{ current: descriptionLength, max: DESCRIPTION_MAX_LENGTH }}
              errors={descriptionErrors}
            >
              <Textarea
                id="description"
                name="description"
                rows={5}
                aria-invalid={
                  descriptionErrors && descriptionErrors.length > 0 ? 'true' : undefined
                }
                aria-describedby={
                  descriptionErrors && descriptionErrors.length > 0
                    ? 'description-error'
                    : undefined
                }
                maxLength={DESCRIPTION_MAX_LENGTH}
                placeholder="解きたい課題、想定ユーザー、差別化のメモなど"
                defaultValue={initialDescription}
                onChange={(e) => setDescriptionLength(e.currentTarget.value.length)}
              />
            </FormField>

            <FormField id="status" label="ライフサイクル状態" errors={statusErrors}>
              <Select name="status" defaultValue={state.fields?.status ?? 'IDEA'}>
                <SelectTrigger
                  id="status"
                  aria-invalid={statusErrors && statusErrors.length > 0 ? 'true' : undefined}
                  aria-describedby={
                    statusErrors && statusErrors.length > 0 ? 'status-error' : undefined
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PROJECT_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {state.formError && (
              <p
                role="alert"
                className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
              >
                {state.formError}
              </p>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '作成中...' : '作成'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ラベル + カウンタ + 子(Input/Textarea/Select) + フィールド直下のエラーをまとめたレイアウト。
 * a11y: エラー要素 id を `aria-describedby` で結びつける前提(各 Input 側で指定)。
 */
function FormField({
  id,
  label,
  required,
  counter,
  errors,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  counter?: { current: number; max: number };
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {required && (
            <span aria-hidden="true" className="text-destructive ml-0.5">
              *
            </span>
          )}
        </Label>
        {counter && <CharCounter current={counter.current} max={counter.max} />}
      </div>
      {children}
      {errors && errors.length > 0 && (
        <ul
          id={`${id}-error`}
          role="alert"
          className="text-destructive space-y-0.5 text-sm"
        >
          {errors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 文字数カウンタ。`current >= max` で `text-destructive` に切り替えて上限到達を可視化する。
 */
function CharCounter({ current, max }: { current: number; max: number }) {
  const reachedLimit = current >= max;
  return (
    <span
      aria-live="polite"
      className={cn(
        'text-xs tabular-nums',
        reachedLimit ? 'text-destructive font-medium' : 'text-muted-foreground',
      )}
    >
      {current} / {max}
    </span>
  );
}
