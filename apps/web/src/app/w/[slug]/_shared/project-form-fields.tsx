'use client';

import { useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PROJECT_STATUSES, PROJECT_STATUS_META } from '@/lib/api/types';

import { FormField } from './form-field';
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PRICING_MODEL_MAX_LENGTH,
  PROBLEM_STATEMENT_MAX_LENGTH,
  PROPOSED_FEATURES_MAX_LENGTH,
  TARGET_USERS_MAX_LENGTH,
  type ProjectFormState,
} from './project-form';

/**
 * プロジェクト作成 / 編集ダイアログで共通利用する入力フィールド一式。
 *
 * - `state` … 直前の Server Action の戻り値。`fieldErrors` / `formError` / `fields` を表示に反映
 * - `defaults` … 編集時の現在値(state.fields が無いときの fallback として使う)
 * - `variant` … `'name-only'` は名前のみ表示し概要・状態を省く(AI 壁打ちモード、§9.7)
 *
 * `state.fields` が再表示用スナップショット、`defaults` が「初回表示の初期値」。
 * バリデーションエラーで弾かれた場合 `state.fields` を優先して入力を保持する。
 */
export function ProjectFormFields({
  state,
  defaults,
  variant = 'full',
}: {
  state: ProjectFormState;
  defaults?: {
    name?: string;
    description?: string;
    status?: string;
    targetUsers?: string;
    problemStatement?: string;
    proposedFeatures?: string;
    pricingModel?: string;
  };
  variant?: 'full' | 'name-only';
}) {
  const initialName = state.fields?.name ?? defaults?.name ?? '';
  const initialDescription = state.fields?.description ?? defaults?.description ?? '';
  const initialStatus = state.fields?.status ?? defaults?.status ?? 'IDEA';
  const initialTargetUsers = state.fields?.targetUsers ?? defaults?.targetUsers ?? '';
  const initialProblemStatement =
    state.fields?.problemStatement ?? defaults?.problemStatement ?? '';
  const initialProposedFeatures =
    state.fields?.proposedFeatures ?? defaults?.proposedFeatures ?? '';
  const initialPricingModel = state.fields?.pricingModel ?? defaults?.pricingModel ?? '';

  const [nameLength, setNameLength] = useState(initialName.length);
  const [descriptionLength, setDescriptionLength] = useState(initialDescription.length);

  const nameErrors = state.fieldErrors?.name;
  const descriptionErrors = state.fieldErrors?.description;
  const statusErrors = state.fieldErrors?.status;
  const targetUsersErrors = state.fieldErrors?.targetUsers;
  const problemStatementErrors = state.fieldErrors?.problemStatement;
  const proposedFeaturesErrors = state.fieldErrors?.proposedFeatures;
  const pricingModelErrors = state.fieldErrors?.pricingModel;

  // 詳細フィールドにエラー or 既存値がある場合は初期 open(ユーザーが気づきやすい)
  const briefHasContent =
    !!initialTargetUsers ||
    !!initialProblemStatement ||
    !!initialProposedFeatures ||
    !!initialPricingModel ||
    !!targetUsersErrors ||
    !!problemStatementErrors ||
    !!proposedFeaturesErrors ||
    !!pricingModelErrors;

  const nameOnly = variant === 'name-only';

  return (
    <>
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
          aria-describedby={nameErrors && nameErrors.length > 0 ? 'name-error' : undefined}
          maxLength={NAME_MAX_LENGTH}
          placeholder="例: roadster-cost-tracker"
          defaultValue={initialName}
          onChange={(e) => setNameLength(e.currentTarget.value.length)}
        />
      </FormField>

      {nameOnly ? (
        // AI 壁打ちモードは概要を作成後に AI と詰めるため、IDEA 状態で名前のみ作成する。
        // 概要・状態は描画しないので、その field エラーは表示先が無く state.formError に出る
        <input type="hidden" name="status" value="IDEA" />
      ) : (
        <>
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
              aria-invalid={descriptionErrors && descriptionErrors.length > 0 ? 'true' : undefined}
              aria-describedby={
                descriptionErrors && descriptionErrors.length > 0 ? 'description-error' : undefined
              }
              maxLength={DESCRIPTION_MAX_LENGTH}
              placeholder="解きたい課題、想定ユーザー、差別化のメモなど"
              defaultValue={initialDescription}
              onChange={(e) => setDescriptionLength(e.currentTarget.value.length)}
            />
          </FormField>

          <FormField id="status" label="ライフサイクル状態" errors={statusErrors}>
            <Select name="status" defaultValue={initialStatus}>
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

          {/*
            ADR-013 改訂版「2 モード化」 の詳細情報フィールド 4 つを `<details>` アコーディオンに格納。
            アイデア検証(IDEA 状態)/ プロダクト診断(IN_DEV 以降)の入力源として AI が読む。
            診断時にフォーム入力させるのではなく、ここで一度入力 → AI 側は保存済データを読むだけ、
            という UX 設計(diagnoses / idea-validations の各ページからはこのアコーディオンの編集を促す)。
          */}
          <details className="bg-muted/30 group rounded-md border" open={briefHasContent}>
            <summary className="hover:bg-muted/50 cursor-pointer rounded-md px-3 py-2 text-sm font-medium select-none">
              詳細情報(アイデア検証 / プロダクト診断の入力源、任意)
            </summary>
            <div className="space-y-4 border-t px-3 py-3">
              <FormField id="targetUsers" label="想定ユーザー" errors={targetUsersErrors}>
                <Textarea
                  id="targetUsers"
                  name="targetUsers"
                  rows={2}
                  aria-invalid={
                    targetUsersErrors && targetUsersErrors.length > 0 ? 'true' : undefined
                  }
                  aria-describedby={
                    targetUsersErrors && targetUsersErrors.length > 0
                      ? 'targetUsers-error'
                      : undefined
                  }
                  maxLength={TARGET_USERS_MAX_LENGTH}
                  placeholder="例: リモートワーカー、副業/独立を視野に入れた個人開発エンジニア"
                  defaultValue={initialTargetUsers}
                />
              </FormField>

              <FormField id="problemStatement" label="解きたい課題" errors={problemStatementErrors}>
                <Textarea
                  id="problemStatement"
                  name="problemStatement"
                  rows={3}
                  aria-invalid={
                    problemStatementErrors && problemStatementErrors.length > 0 ? 'true' : undefined
                  }
                  aria-describedby={
                    problemStatementErrors && problemStatementErrors.length > 0
                      ? 'problemStatement-error'
                      : undefined
                  }
                  maxLength={PROBLEM_STATEMENT_MAX_LENGTH}
                  placeholder="例: 集中阻害要因の可視化機能を持つタイマーアプリが少ない"
                  defaultValue={initialProblemStatement}
                />
              </FormField>

              <FormField
                id="proposedFeatures"
                label="想定機能(Markdown 可)"
                errors={proposedFeaturesErrors}
              >
                <Textarea
                  id="proposedFeatures"
                  name="proposedFeatures"
                  rows={4}
                  aria-invalid={
                    proposedFeaturesErrors && proposedFeaturesErrors.length > 0 ? 'true' : undefined
                  }
                  aria-describedby={
                    proposedFeaturesErrors && proposedFeaturesErrors.length > 0
                      ? 'proposedFeatures-error'
                      : undefined
                  }
                  maxLength={PROPOSED_FEATURES_MAX_LENGTH}
                  placeholder={'- ポモドーロタイマー\n- 中断ログ\n- 週次レポート'}
                  defaultValue={initialProposedFeatures}
                />
              </FormField>

              <FormField id="pricingModel" label="想定価格モデル" errors={pricingModelErrors}>
                <Input
                  id="pricingModel"
                  name="pricingModel"
                  aria-invalid={
                    pricingModelErrors && pricingModelErrors.length > 0 ? 'true' : undefined
                  }
                  aria-describedby={
                    pricingModelErrors && pricingModelErrors.length > 0
                      ? 'pricingModel-error'
                      : undefined
                  }
                  maxLength={PRICING_MODEL_MAX_LENGTH}
                  placeholder="例: Free / Pro ¥980 月 / Team ¥2,800 人月"
                  defaultValue={initialPricingModel}
                />
              </FormField>
            </div>
          </details>
        </>
      )}

      {state.formError && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {state.formError}
        </p>
      )}
    </>
  );
}

// FormField / CharCounter は `_shared/form-field.tsx` に移管(ドメイン非依存)。
// Day 21 以降の Document フォームからも同じ部品を再利用する。
export { FormField, CharCounter } from './form-field';
