/**
 * 壁打ち要約の Server Action で共有する型・定数・パース。
 * `'use server'` ファイルから値を export できないためここに集約する。
 */

import { INSTRUCTIONS_MAX_LENGTH } from '@/app/w/[slug]/_shared/ai-form';

export { INSTRUCTIONS_MAX_LENGTH };

/** API `UpdateProjectDto.description` の `@MaxLength(20_000)` と同期。 */
export const DESCRIPTION_MAX_LENGTH = 20_000;

/** 生成ステップの状態。 */
export interface SessionSummaryFormState {
  ok: boolean;
  fieldErrors?: { instructions?: string[] };
  formError?: string;
  quotaExceeded?: boolean;
  description?: string;
  /** 生成時点の現在の概要。プレビューで新旧を並べる。 */
  currentDescription?: string | null;
  /** 会話が長く、直近の一部だけを要約対象にした。 */
  transcriptTruncated?: boolean;
  /** 生成された概要が上限文字数で切り詰められた。 */
  descriptionTruncated?: boolean;
  fields?: { instructions?: string };
}

export const INITIAL_SESSION_SUMMARY_FORM_STATE: SessionSummaryFormState = { ok: false };

/** 保存ステップの状態。 */
export interface ApplyDescriptionFormState {
  ok: boolean;
  fieldErrors?: { description?: string[] };
  formError?: string;
}

export const INITIAL_APPLY_DESCRIPTION_FORM_STATE: ApplyDescriptionFormState = { ok: false };

export function parseSessionSummaryFormData(formData: FormData): {
  instructions: string | undefined;
  fieldErrors: { instructions?: string[] };
  fields: { instructions: string };
} {
  const instructionsRaw = String(formData.get('instructions') ?? '').replace(/\s+$/, '');

  const fieldErrors: { instructions?: string[] } = {};
  if (instructionsRaw.length > INSTRUCTIONS_MAX_LENGTH) {
    fieldErrors.instructions = [
      `追加プロンプトは ${INSTRUCTIONS_MAX_LENGTH.toLocaleString()} 文字以内で入力してください。`,
    ];
  }

  return {
    instructions: instructionsRaw.length > 0 ? instructionsRaw : undefined,
    fieldErrors,
    fields: { instructions: instructionsRaw },
  };
}

/** 空での保存は許さない(概要を消すのは編集画面から)。 */
export function parseApplyDescriptionFormData(formData: FormData): {
  description: string;
  fieldErrors: { description?: string[] };
} {
  const description = String(formData.get('description') ?? '').replace(/\s+$/, '');

  const fieldErrors: { description?: string[] } = {};
  if (description.length === 0) {
    fieldErrors.description = ['概要が空です。本文を入力してから保存してください。'];
  } else if (description.length > DESCRIPTION_MAX_LENGTH) {
    fieldErrors.description = [
      `概要は ${DESCRIPTION_MAX_LENGTH.toLocaleString()} 文字以内で入力してください。`,
    ];
  }

  return { description, fieldErrors };
}
