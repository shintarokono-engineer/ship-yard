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
import {
  CATEGORY_DOMAIN_LABEL,
  CATEGORY_DOMAINS,
  PRICING_TIER_LABEL,
  PRICING_TIERS,
  PROJECT_STATUS_META,
  PROJECT_STATUSES,
} from '@/lib/api/types';

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

/** shadcn(Radix) Select は `value=""` を許さないため、「未選択 → クリア」 用センチネル。 */
const NONE_VALUE = '__none__';

/** 編集モードの defaults。新規モード(NewProjectDialog)では未指定で空状態起動。 */
export interface ProjectFormDefaults {
  name?: string;
  description?: string;
  status?: string;
  // 自由補足 4 フィールド
  targetUsers?: string;
  problemStatement?: string;
  proposedFeatures?: string;
  pricingModel?: string;
  // 構造化セレクト 2 フィールド(Day 46.5 案 A、ADR-013 改訂版「構造化入力 v2」)
  categoryDomain?: string;
  pricingTier?: string;
}

/**
 * プロジェクト作成 / 編集ダイアログで共通利用する入力フィールド一式。
 *
 * - `state` … 直前の Server Action の戻り値。`fieldErrors` / `formError` / `fields` を表示に反映
 * - `defaults` … 編集時の現在値(state.fields が無いときの fallback として使う)
 * - `variant` … `'name-only'` は名前のみ表示し概要・状態を省く(AI 壁打ちモード、§9.7)
 */
export function ProjectFormFields({
  state,
  defaults,
  variant = 'full',
}: {
  state: ProjectFormState;
  defaults?: ProjectFormDefaults;
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

  // 構造化セレクト 2 フィールドの初期値(Day 46.5 案 A)。
  const initialCategoryDomain = state.fields?.categoryDomain ?? defaults?.categoryDomain ?? '';
  const initialPricingTier = state.fields?.pricingTier ?? defaults?.pricingTier ?? '';

  const [nameLength, setNameLength] = useState(initialName.length);
  const [descriptionLength, setDescriptionLength] = useState(initialDescription.length);

  const nameErrors = state.fieldErrors?.name;
  const descriptionErrors = state.fieldErrors?.description;
  const statusErrors = state.fieldErrors?.status;
  const targetUsersErrors = state.fieldErrors?.targetUsers;
  const problemStatementErrors = state.fieldErrors?.problemStatement;
  const proposedFeaturesErrors = state.fieldErrors?.proposedFeatures;
  const pricingModelErrors = state.fieldErrors?.pricingModel;
  const categoryDomainErrors = state.fieldErrors?.categoryDomain;
  const pricingTierErrors = state.fieldErrors?.pricingTier;

  // 詳細フィールド(自由補足 + 構造化セレクト)にエラー or 既存値がある場合は初期 open。
  const briefHasContent =
    !!initialTargetUsers ||
    !!initialProblemStatement ||
    !!initialProposedFeatures ||
    !!initialPricingModel ||
    !!initialCategoryDomain ||
    !!initialPricingTier ||
    !!targetUsersErrors ||
    !!problemStatementErrors ||
    !!proposedFeaturesErrors ||
    !!pricingModelErrors ||
    !!categoryDomainErrors ||
    !!pricingTierErrors;

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
            ADR-013 改訂版「構造化入力 v2」(Day 46.5 案 A)の詳細情報フィールド。
            - 上段: 構造化セレクト 2 軸(ドメイン分類 + 課金モデル統合、B2C/B2B 両対応)
            - 下段: 自由補足 4 つ(textarea、プレースホルダーで「何を書くか」 を誘導)
            アイデア検証(IDEA 状態)/ プロダクト診断(IN_DEV 以降)の入力源として AI が読む。
          */}
          <details className="bg-muted/30 group rounded-md border" open={briefHasContent}>
            <summary className="hover:bg-muted/50 cursor-pointer rounded-md px-3 py-2 text-sm font-medium select-none">
              詳細情報(アイデア検証 / プロダクト診断の入力源、任意)
            </summary>
            <div className="space-y-5 border-t px-3 py-4">
              <p className="text-muted-foreground text-xs leading-relaxed">
                以下を具体的に書くほど AI 診断の精度が上がります(全項目任意)。 B2C(個人向け)/
                B2B(組織向け)どちらのプロダクトでも入力できます。
              </p>

              {/* ===== 構造化セレクト 2 フィールド(Day 46.5 案 A) ===== */}
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  id="categoryDomain"
                  label="プロダクトのドメイン"
                  errors={categoryDomainErrors}
                >
                  <Select name="categoryDomain" defaultValue={initialCategoryDomain || NONE_VALUE}>
                    <SelectTrigger id="categoryDomain">
                      <SelectValue placeholder="選択する" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>選択しない(クリア)</SelectItem>
                      {CATEGORY_DOMAINS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_DOMAIN_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField
                  id="pricingTier"
                  label="課金モデル + 月額レンジ"
                  errors={pricingTierErrors}
                >
                  <Select name="pricingTier" defaultValue={initialPricingTier || NONE_VALUE}>
                    <SelectTrigger id="pricingTier">
                      <SelectValue placeholder="選択する" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>選択しない(クリア)</SelectItem>
                      {PRICING_TIERS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PRICING_TIER_LABEL[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </section>

              {/* ===== 自由補足 4 フィールド(Day 44、プレースホルダー強化) ===== */}
              <section className="border-border/60 space-y-4 border-t pt-4">
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
                    placeholder="ユーザー像を 1〜2 行で。例: 20〜30 代の社会人で集中力を高めたい個人 / 中小企業の経理担当者 / 子育て中の親"
                    defaultValue={initialTargetUsers}
                  />
                </FormField>

                <FormField
                  id="problemStatement"
                  label="解きたい課題"
                  errors={problemStatementErrors}
                >
                  <Textarea
                    id="problemStatement"
                    name="problemStatement"
                    rows={3}
                    aria-invalid={
                      problemStatementErrors && problemStatementErrors.length > 0
                        ? 'true'
                        : undefined
                    }
                    aria-describedby={
                      problemStatementErrors && problemStatementErrors.length > 0
                        ? 'problemStatement-error'
                        : undefined
                    }
                    maxLength={PROBLEM_STATEMENT_MAX_LENGTH}
                    placeholder="何の課題を解決するか具体的に。例: 集中阻害要因の可視化機能を持つタイマーアプリが少ない / 既存ツールは複雑で使いこなせない"
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
                      proposedFeaturesErrors && proposedFeaturesErrors.length > 0
                        ? 'true'
                        : undefined
                    }
                    aria-describedby={
                      proposedFeaturesErrors && proposedFeaturesErrors.length > 0
                        ? 'proposedFeatures-error'
                        : undefined
                    }
                    maxLength={PROPOSED_FEATURES_MAX_LENGTH}
                    placeholder={
                      'コア機能を箇条書きで 3〜10 個。\n例:\n- ポモドーロタイマー\n- 中断ログ自動記録\n- 週次レポート\n- ソーシャル共有'
                    }
                    defaultValue={initialProposedFeatures}
                  />
                </FormField>

                <FormField id="pricingModel" label="価格モデルの補足" errors={pricingModelErrors}>
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
                    placeholder="上の課金モデルで表現しきれない補足。例: 年払い 20% 割引 / 学生プラン半額 / Team は人数課金 ¥2,800/人"
                    defaultValue={initialPricingModel}
                  />
                </FormField>
              </section>
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
