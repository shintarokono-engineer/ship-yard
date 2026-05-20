/**
 * 招待発行フォームの共通型・定数・ヘルパー。
 *
 * `'use server'` を付けない通常モジュールとして書く。Server Action(`_actions/create-invitation.ts`)
 * と Client Component(`_components/invite-member-dialog.tsx`)の両方から import する。
 */

import { NON_OWNER_ROLES, type NonOwnerRole } from '@/lib/api/types';

/** バリデーション対象フィールド。 */
export const FORM_FIELDS = ['email', 'role'] as const;
export type FieldName = (typeof FORM_FIELDS)[number];

/**
 * 招待発行 Server Action が返すフォーム状態。
 *
 * - `ok` … 成功フラグ(ダイアログの自動 close 判定に使う)
 * - `mailSent` … 招待トークン作成は成功したがメール送信は失敗、というケースを toast で通知する用
 * - `fieldErrors` … フィールド単位のエラー
 * - `formError` … フィールドに紐付かない全体エラー
 * - `fields` … エラー時に入力値を保持して再表示するスナップショット
 */
export interface InvitationFormState {
  ok: boolean;
  mailSent?: boolean;
  invitedEmail?: string;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  formError?: string;
  fields?: { email?: string; role?: string };
}

export const INITIAL_INVITATION_FORM_STATE: InvitationFormState = { ok: false };

/**
 * `FormData` から email / role を取り出し、最低限のバリデーションを行う。
 *
 * 戻り値の `data` が `null` のときはバリデーション失敗(`fieldErrors` を Server Action から返す)。
 */
export function parseInvitationFormData(formData: FormData): {
  data: { email: string; role: NonOwnerRole } | null;
  fieldErrors: Partial<Record<FieldName, string[]>>;
  fields: { email: string; role: string };
} {
  const email = String(formData.get('email') ?? '').trim();
  const roleRaw = String(formData.get('role') ?? '').trim();

  const fieldErrors: Partial<Record<FieldName, string[]>> = {};
  if (email.length === 0) {
    pushFieldError(fieldErrors, 'email', 'メールアドレスを入力してください。');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    pushFieldError(fieldErrors, 'email', '有効なメールアドレスを入力してください。');
  }

  const role = (NON_OWNER_ROLES as readonly string[]).includes(roleRaw)
    ? (roleRaw as NonOwnerRole)
    : null;
  if (role === null) {
    pushFieldError(fieldErrors, 'role', 'ロールを選択してください。');
  }

  const fields = { email, role: roleRaw };

  if (Object.keys(fieldErrors).length > 0 || role === null) {
    return { data: null, fieldErrors, fields };
  }
  return { data: { email, role }, fieldErrors, fields };
}

export function pushFieldError(
  bag: Partial<Record<FieldName, string[]>>,
  field: FieldName,
  message: string,
): void {
  (bag[field] ??= []).push(message);
}

/**
 * NestJS `class-validator` の既定メッセージはフィールド名で始まる(例: "email must be an email")。
 * 先頭トークンをフィールド名として一致を試み、当たれば `fieldErrors`、外れれば `formErrors` に振る。
 *
 * Set はリクエスト毎に生成する(`'use server'` 経路でも参照される可能性があるため、
 * モジュールスコープの mutable state を持たない方針 — 既存 `project-form.ts` と同じ)。
 */
export function classifyApiMessages(messages: string[]): {
  fieldErrors: Partial<Record<FieldName, string[]>>;
  formErrors: string[];
} {
  const knownFields: ReadonlySet<string> = new Set(FORM_FIELDS);
  const fieldErrors: Partial<Record<FieldName, string[]>> = {};
  const formErrors: string[] = [];
  for (const msg of messages) {
    const firstToken = msg.split(/\s+/)[0]?.toLowerCase();
    if (firstToken && knownFields.has(firstToken)) {
      pushFieldError(fieldErrors, firstToken as FieldName, msg);
    } else {
      formErrors.push(msg);
    }
  }
  return { fieldErrors, formErrors };
}
