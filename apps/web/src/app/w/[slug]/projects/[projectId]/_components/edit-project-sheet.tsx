'use client';

import { useActionState, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { Project } from '@/lib/api/types';

import { INITIAL_PROJECT_FORM_STATE, parseProjectFormData } from '../../../_shared/project-form';
import { ProjectFormFields } from '../../../_shared/project-form-fields';
import { updateProjectAction, type ProjectFormState } from '../_actions/update-project';

/**
 * プロジェクト編集パネル(右スライドの Sheet)。
 *
 * 以前は Dialog(`max-h-[90vh]`)だったが、入力フィールドが 9 個あるため
 * 「ヘッダーだけ固定 + 中身は狭い窓をスクロール」 という構造になり、
 * スクロールするとフィールドのラベルが流れて入力欄だけが残っていた。
 * Sheet は縦をビューポート全高使えるので、同じ内容でも 1 画面に収まりやすい。
 *
 * **開閉 state はこのコンポーネントが持ち、トリガーも内包する。**
 * 成功時のクローズは render 中の prev-state 比較で行うが(`useEffect` は使わない。
 * 連続編集でも `state` の reference が変わるため確実に発火する)、これは
 * **自分の state を更新する場合のみ** 許されるパターン。開閉を親に持たせて
 * render 中に親の setter を呼ぶと「別コンポーネントを render 中に更新した」 ことになり、
 * React が `Cannot update a component while rendering a different component` を出す。
 */
export function EditProjectSheet({ slug, project }: { slug: string; project: Project }) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => updateProjectAction.bind(null, slug, project.id),
    [slug, project.id],
  );
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    boundAction,
    INITIAL_PROJECT_FORM_STATE,
  );

  // 送信前にクライアント側で弾いた結果。null の間はサーバ側の `state` をそのまま表示する。
  const [clientState, setClientState] = useState<ProjectFormState | null>(null);
  const shownState = clientState ?? state;

  // 成功時に render 中で prev-state 比較して閉じる(更新先は自分の state)。
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.ok) setOpen(false);
  }

  // 名前を空にしたまま保存されても dispatch せず弾く(サーバ往復なし=ボタン文言のちらつき防止)。
  // 検証は Server Action と同じ `parseProjectFormData` を使うので二重管理にならない。
  //
  // `fieldErrors` だけでなく `fields`(入力値スナップショット)も載せている。
  // React 19 の `<form action>` はフォームをリセットしうるため、エラーだけ返すと
  // 利用者が書いた内容が消える可能性がある。`fields` を渡しておけばリセットが起きても
  // `defaultValue` 経由で内容が戻り、起きなければ無害(保険)。
  function handleSubmit(formData: FormData) {
    const parsed = parseProjectFormData(formData);
    if (!parsed.data) {
      setClientState({ ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields });
      return;
    }
    setClientState(null);
    formAction(formData);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // 閉じたら事前検証の結果を捨てる(次に開いたときエラーが残らないように)
        if (!next) setClientState(null);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline">
          <Pencil aria-hidden="true" />
          編集
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>プロジェクトを編集</SheetTitle>
          <SheetDescription>
            基本情報と、AI 検証 / 診断が読み取る詳細情報を更新します。
          </SheetDescription>
        </SheetHeader>

        <form action={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          {/* ネイティブのスクロールバーはカウンタやラベルに重なる。Radix の overlay 型に寄せる。 */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 px-6 py-5">
              <ProjectFormFields
                state={shownState}
                defaults={{
                  name: project.name,
                  description: project.description ?? '',
                  status: project.status,
                  // 自由補足 4 フィールド(Day 44)
                  targetUsers: project.targetUsers ?? '',
                  problemStatement: project.problemStatement ?? '',
                  proposedFeatures: project.proposedFeatures ?? '',
                  pricingModel: project.pricingModel ?? '',
                  // 構造化セレクト 2 フィールド(Day 46.5 案 A)
                  categoryDomain: project.categoryDomain ?? '',
                  pricingTier: project.pricingTier ?? '',
                }}
              />
            </div>
          </ScrollArea>

          <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '保存中...' : '保存'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
