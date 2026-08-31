'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  CATEGORY_DOMAIN_LABEL,
  CATEGORY_DOMAINS,
  PRICING_TIER_LABEL,
  PRICING_TIERS,
  PROJECT_STATUS_META,
  PROJECT_STATUSES,
} from '@/lib/api/types';

import { CharCounter, FormField } from './form-field';
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
 *
 * カウンタは `InputGroup` の内側に置く。枠の外に出すとスクロールバーと重なって数字が欠ける。
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

  // 開閉を自前で持つ理由は `CollapsibleContent` のコメントを参照。
  const [briefOpen, setBriefOpen] = useState(briefHasContent);

  // ライフサイクル状態は ToggleGroup(button 群)なので、値を state で持って hidden input で送る。
  const [status, setStatus] = useState(initialStatus);

  const nameOnly = variant === 'name-only';

  return (
    <>
      <FormField id="name" label="名前" required errors={nameErrors}>
        <InputGroup>
          <InputGroupInput
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
          {/* live region は常時マウントする(後から挿入すると読み上げられない)。 */}
          <InputGroupAddon align="inline-end">
            <CharCounter current={nameLength} max={NAME_MAX_LENGTH} />
          </InputGroupAddon>
        </InputGroup>
      </FormField>

      {nameOnly ? (
        // AI 壁打ちモードは概要を作成後に AI と詰めるため、IDEA 状態で名前のみ作成する。
        <input type="hidden" name="status" value="IDEA" />
      ) : (
        <>
          <FormField id="description" label="概要" hint="Markdown 可" errors={descriptionErrors}>
            <InputGroup>
              <InputGroupTextarea
                id="description"
                name="description"
                rows={6}
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
              <InputGroupAddon align="block-end" className="justify-end">
                <CharCounter current={descriptionLength} max={DESCRIPTION_MAX_LENGTH} />
              </InputGroupAddon>
            </InputGroup>
          </FormField>

          {/* 5 個固定で順序のある段階なので、全部が一度に見えるセグメントにする。 */}
          <FormField as="fieldset" id="status" label="ライフサイクル状態" errors={statusErrors}>
            {/* ToggleGroup は button 群なので FormData に載らない。値は hidden input で送る。 */}
            <input type="hidden" name="status" value={status} />
            <ToggleGroup
              type="single"
              variant="outline"
              value={status}
              // 選択済みの項目をもう一度押すと `''` が来る。状態は必ず 1 つなので無視する。
              onValueChange={(next) => {
                if (next) setStatus(next);
              }}
              className="w-full flex-wrap"
              aria-describedby={
                statusErrors && statusErrors.length > 0 ? 'status-error' : undefined
              }
            >
              {PROJECT_STATUSES.map((s) => (
                <ToggleGroupItem
                  key={s}
                  value={s}
                  // 既定の on 状態(bg-accent)は 5 個並ぶと判別しづらいので塗って浮かせる。
                  className="data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground flex-1 whitespace-nowrap data-[state=on]:font-medium"
                >
                  {PROJECT_STATUS_META[s].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FormField>

          {/*
            ADR-013 改訂版「構造化入力 v2」(Day 46.5 案 A)の詳細情報フィールド。
            アイデア検証(IDEA 状態)/ プロダクト診断(IN_DEV 以降)の入力源として AI が読む。
          */}
          <Collapsible
            open={briefOpen}
            onOpenChange={setBriefOpen}
            className="bg-muted/30 rounded-md border"
          >
            <CollapsibleTrigger className="hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium outline-none select-none focus-visible:ring-[3px] [&[data-state=open]>svg]:rotate-180">
              <span>
                詳細情報
                <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                  アイデア検証 / プロダクト診断の入力源・任意
                </span>
              </span>
              <ChevronDown
                className="text-muted-foreground size-4 shrink-0 transition-transform duration-200"
                aria-hidden="true"
              />
            </CollapsibleTrigger>
            {/*
              `forceMount` 必須。外すと閉じている間 children が unmount され、折りたたんだまま
              保存したときに中の 6 フィールドが FormData から落ちて既存値が null で潰れる。
              ただし forceMount 時は Radix が `hidden` を付けないので表示制御は自前で行う
              (display:none 配下のフォームコントロールも送信はされる)。
            */}
            <CollapsibleContent forceMount hidden={!briefOpen}>
              <div className="space-y-5 border-t px-3 py-4">
                {/* JSX の改行は半角スペースになるため、1 つの文字列で渡す。 */}
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {
                    '以下を具体的に書くほど AI 診断の精度が上がります。B2C(個人向け) / B2B(組織向け) どちらのプロダクトでも入力できます。'
                  }
                </p>

                {/* ===== 構造化セレクト 2 フィールド(Day 46.5 案 A) ===== */}
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    id="categoryDomain"
                    label="プロダクトのドメイン"
                    errors={categoryDomainErrors}
                  >
                    <Select
                      name="categoryDomain"
                      defaultValue={initialCategoryDomain || NONE_VALUE}
                    >
                      <SelectTrigger id="categoryDomain" className="w-full">
                        <SelectValue placeholder="選択する" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* 未選択の既定表示。「クリア」 は初回入力時に意味を成さないので使わない。 */}
                        <SelectItem value={NONE_VALUE}>指定しない</SelectItem>
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
                      <SelectTrigger id="pricingTier" className="w-full">
                        <SelectValue placeholder="選択する" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>指定しない</SelectItem>
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
                    label="想定機能"
                    hint="Markdown 可"
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
                      placeholder="上の課金モデルで表現しきれない補足。例: 年払い 20% 割引 / 学生プラン半額"
                      defaultValue={initialPricingModel}
                    />
                  </FormField>
                </section>
              </div>
            </CollapsibleContent>
          </Collapsible>
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
