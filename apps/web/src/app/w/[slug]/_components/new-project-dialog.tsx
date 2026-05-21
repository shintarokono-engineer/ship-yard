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
import { cn } from '@/lib/utils';

import { createProjectAction, type ProjectFormState } from '../_actions/create-project';
import { ProjectFormFields } from '../_shared/project-form-fields';
import { INITIAL_PROJECT_FORM_STATE } from '../_shared/project-form';

/** 概要の決め方(§9.7)。`mode` は FormData として Server Action に渡り、成功時の遷移先を分岐する。 */
type DescriptionMode = 'write' | 'chat';

const MODE_OPTIONS: { value: DescriptionMode; title: string; hint: string }[] = [
  { value: 'write', title: '自分で書く', hint: '概要を直接入力します' },
  { value: 'chat', title: 'AI と壁打ち', hint: '名前だけで作成し、作成後に AI と概要を詰めます' },
];

export function NewProjectDialog({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DescriptionMode>('write');
  const boundAction = useMemo(() => createProjectAction.bind(null, slug), [slug]);
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    boundAction,
    INITIAL_PROJECT_FORM_STATE,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // 閉じたら次回はまっさらの「自分で書く」で開く
        if (!next) setMode('write');
      }}
    >
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
            {mode === 'chat'
              ? '名前を入力して作成すると、AI と壁打ちしながら概要を詰められます。'
              : '名前と概要を入力してください。あとから編集できます。'}
          </DialogDescription>
        </DialogHeader>

        {/* noValidate でブラウザ既定のバリデーション吹き出しを抑制し、サーバー側の
            検証結果(フィールド直下 / フォーム全体)に表示を一本化する */}
        <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">概要の決め方</legend>
              <div className="grid grid-cols-2 gap-2">
                {MODE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors',
                      'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                      mode === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-input hover:bg-accent',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="radio"
                        name="mode"
                        value={opt.value}
                        checked={mode === opt.value}
                        onChange={() => setMode(opt.value)}
                        className="size-4 cursor-pointer"
                      />
                      {opt.title}
                    </span>
                    <span className="text-muted-foreground text-xs">{opt.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <ProjectFormFields state={state} variant={mode === 'chat' ? 'name-only' : 'full'} />
          </div>

          <DialogFooter className="shrink-0 pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '作成中...' : mode === 'chat' ? '作成して壁打ち' : '作成'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
