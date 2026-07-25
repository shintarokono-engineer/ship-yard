'use client';

import { useActionState, useState } from 'react';
import { Rocket } from 'lucide-react';

import { FormField } from '@/app/w/[slug]/_shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { createWorkspaceAction, type OnboardingFormState } from '../_actions/create-workspace';
import {
  INITIAL_ONBOARDING_FORM_STATE,
  NAME_MAX_LENGTH,
  parseOnboardingFormData,
  SLUG_MAX_LENGTH,
} from '../_shared/onboarding-form';

/** 新規ワークスペース作成フォーム(Server Action 経由)。成功時は Action 側で `/w/{slug}` へ redirect。 */
export function CreateWorkspaceForm() {
  const [state, formAction, pending] = useActionState<OnboardingFormState, FormData>(
    createWorkspaceAction,
    INITIAL_ONBOARDING_FORM_STATE,
  );

  const initialName = state.fields?.name ?? '';
  const initialSlug = state.fields?.slug ?? '';
  const [nameLength, setNameLength] = useState(initialName.length);
  const [slugLength, setSlugLength] = useState(initialSlug.length);

  // クライアント側の事前検証エラー。空送信など明らかに不正な入力を、Server Action へ
  // dispatch せずにこの場で弾くために使う(サーバ往復を挟まないので `pending` が一瞬 true に
  // なってボタン文言がちらつく現象を防ぐ)。null の間はサーバ側 `state.fieldErrors` を表示する。
  const [clientFieldErrors, setClientFieldErrors] = useState<
    OnboardingFormState['fieldErrors'] | null
  >(null);

  // 表示するエラーはクライアント検証を優先(不正入力を弾いた直後の表示)。
  // 検証を通過して dispatch した後は null に戻し、サーバ側のエラー(409 slug 衝突等)を出す。
  const displayErrors = clientFieldErrors ?? state.fieldErrors;
  const nameErrors = displayErrors?.name;
  const slugErrors = displayErrors?.slug;

  // form の action。まず Server Action と同一の `parseOnboardingFormData` で検証し、
  // 不正なら dispatch せずカスタム文言を表示(ちらつき防止)。妥当なら Server Action を dispatch。
  function handleSubmit(formData: FormData) {
    const parsed = parseOnboardingFormData(formData);
    if (Object.keys(parsed.fieldErrors).length > 0 || !parsed.data) {
      setClientFieldErrors(parsed.fieldErrors);
      return;
    }
    setClientFieldErrors(null);
    formAction(formData);
  }

  // noValidate: ブラウザ標準の required バリデーション(「このフィールドを入力してください。」)を
  // 抑止し、クライアント/サーバ共通のカスタム文言(fieldErrors)で統一表示する。
  return (
    <form action={handleSubmit} className="space-y-4" noValidate>
      <FormField
        id="name"
        label="ワークスペース名"
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
          aria-describedby={nameErrors && nameErrors.length > 0 ? 'name-error' : undefined}
          maxLength={NAME_MAX_LENGTH}
          defaultValue={initialName}
          placeholder="例: My Team"
          onChange={(e) => setNameLength(e.currentTarget.value.length)}
          disabled={pending}
        />
      </FormField>

      <FormField
        id="slug"
        label="URL(任意)"
        counter={{ current: slugLength, max: SLUG_MAX_LENGTH }}
        errors={slugErrors}
      >
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">shipyard.app/w/</span>
          <Input
            id="slug"
            name="slug"
            aria-invalid={slugErrors && slugErrors.length > 0 ? 'true' : undefined}
            aria-describedby={slugErrors && slugErrors.length > 0 ? 'slug-error' : undefined}
            maxLength={SLUG_MAX_LENGTH}
            defaultValue={initialSlug}
            placeholder="my-team(空欄ならワークスペース名から自動生成)"
            onChange={(e) => setSlugLength(e.currentTarget.value.length)}
            disabled={pending}
          />
        </div>
      </FormField>

      {state.formError && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {state.formError}
        </p>
      )}

      <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
        <Rocket aria-hidden="true" />
        {pending ? '作成中...' : 'ワークスペースを作成'}
      </Button>
    </form>
  );
}
