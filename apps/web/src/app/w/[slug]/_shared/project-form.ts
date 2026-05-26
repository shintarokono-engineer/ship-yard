/**
 * プロジェクト作成 / 編集 フォームで共有する型・定数・ヘルパー。
 *
 * **`'use server'` を付けない通常モジュール**として書く。これを各 Server Action
 * (`_actions/create-project.ts` / `projects/[projectId]/_actions/update-project.ts`)から
 * import することで、`'use server'` ファイルでは export できない定数・型・同期関数を共有する。
 *
 * ファイル自体は Client / Server どちらからも import 可能(`isWriterRole` 等を持つ
 * `lib/api/types.ts` と同じ運用)。`server-only` は付けない — Server Action 経由でしか
 * 呼ばれない前提だが、Client Component が `INITIAL_STATE` 等を参照することもあるため。
 */

import { PROJECT_STATUSES, type ProjectStatus } from '@/lib/api/types';

/** name の最大長(apps/api `CreateProjectDto` / `UpdateProjectDto` と一致)。 */
export const NAME_MAX_LENGTH = 100;
/** description の最大長(apps/api `CreateProjectDto` / `UpdateProjectDto` と一致)。 */
export const DESCRIPTION_MAX_LENGTH = 20_000;

/** ADR-013 改訂版「2 モード化」 の詳細情報フィールドの最大長(apps/api DTO と一致)。 */
export const TARGET_USERS_MAX_LENGTH = 2_000;
export const PROBLEM_STATEMENT_MAX_LENGTH = 2_000;
export const PROPOSED_FEATURES_MAX_LENGTH = 5_000;
export const PRICING_MODEL_MAX_LENGTH = 500;

/** バリデーション対象フィールド(ADR-013 改訂版で詳細情報フィールド 4 つを追加)。 */
export const FORM_FIELDS = [
  'name',
  'description',
  'status',
  'targetUsers',
  'problemStatement',
  'proposedFeatures',
  'pricingModel',
] as const;
export type FieldName = (typeof FORM_FIELDS)[number];

/**
 * プロジェクト作成 / 編集の Server Action が共有するフォーム状態。
 *
 * - `ok` … 成功フラグ(編集ダイアログの自動 close 等の判定に使う)
 * - `fieldErrors` … フィールド単位のエラー(該当 Input の直下に表示)
 * - `formError` … フィールドに紐付かない全体エラー(認可エラー・5xx 等、フッター付近)
 * - `fields` … エラー時に入力値を保持して再表示するスナップショット
 */
export interface ProjectFormState {
  ok: boolean;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  formError?: string;
  fields?: {
    name?: string;
    description?: string;
    status?: string;
    targetUsers?: string;
    problemStatement?: string;
    proposedFeatures?: string;
    pricingModel?: string;
  };
}

/** ダイアログ初期表示用の空 state(各ダイアログから参照する)。 */
export const INITIAL_PROJECT_FORM_STATE: ProjectFormState = { ok: false };

/**
 * `FormData` から name / description / status を取り出し、最低限のバリデーションを行う。
 *
 * - 戻り値の `data` が `null` のときはバリデーション失敗(`fieldErrors` を Server Action から返す)
 * - 戻り値の `data` が非 null のときは API に投げて良い形に正規化済み
 * - `fields` は再表示用のスナップショット(成功時も失敗時もそのまま入力欄に戻せる)
 */
export function parseProjectFormData(formData: FormData): {
  data: {
    name: string;
    description: string;
    status: ProjectStatus | undefined;
    targetUsers: string;
    problemStatement: string;
    proposedFeatures: string;
    pricingModel: string;
  } | null;
  fieldErrors: Partial<Record<FieldName, string[]>>;
  fields: {
    name: string;
    description: string;
    status: string;
    targetUsers: string;
    problemStatement: string;
    proposedFeatures: string;
    pricingModel: string;
  };
} {
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const statusRaw = String(formData.get('status') ?? '').trim();
  const status = (PROJECT_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as ProjectStatus)
    : undefined;
  const targetUsers = String(formData.get('targetUsers') ?? '').trim();
  const problemStatement = String(formData.get('problemStatement') ?? '').trim();
  const proposedFeatures = String(formData.get('proposedFeatures') ?? '').trim();
  const pricingModel = String(formData.get('pricingModel') ?? '').trim();

  const fieldErrors: Partial<Record<FieldName, string[]>> = {};
  if (name.length === 0) {
    pushFieldError(fieldErrors, 'name', 'プロジェクト名を入力してください。');
  } else if (name.length > NAME_MAX_LENGTH) {
    pushFieldError(
      fieldErrors,
      'name',
      `プロジェクト名は ${NAME_MAX_LENGTH} 文字以内で入力してください。`,
    );
  }
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    pushFieldError(
      fieldErrors,
      'description',
      `概要は ${DESCRIPTION_MAX_LENGTH} 文字以内で入力してください。`,
    );
  }
  if (targetUsers.length > TARGET_USERS_MAX_LENGTH) {
    pushFieldError(
      fieldErrors,
      'targetUsers',
      `想定ユーザーは ${TARGET_USERS_MAX_LENGTH} 文字以内で入力してください。`,
    );
  }
  if (problemStatement.length > PROBLEM_STATEMENT_MAX_LENGTH) {
    pushFieldError(
      fieldErrors,
      'problemStatement',
      `解きたい課題は ${PROBLEM_STATEMENT_MAX_LENGTH} 文字以内で入力してください。`,
    );
  }
  if (proposedFeatures.length > PROPOSED_FEATURES_MAX_LENGTH) {
    pushFieldError(
      fieldErrors,
      'proposedFeatures',
      `想定機能は ${PROPOSED_FEATURES_MAX_LENGTH} 文字以内で入力してください。`,
    );
  }
  if (pricingModel.length > PRICING_MODEL_MAX_LENGTH) {
    pushFieldError(
      fieldErrors,
      'pricingModel',
      `想定価格モデルは ${PRICING_MODEL_MAX_LENGTH} 文字以内で入力してください。`,
    );
  }

  const fields = {
    name,
    description,
    status: statusRaw,
    targetUsers,
    problemStatement,
    proposedFeatures,
    pricingModel,
  };

  if (Object.keys(fieldErrors).length > 0) {
    return { data: null, fieldErrors, fields };
  }
  return {
    data: {
      name,
      description,
      status,
      targetUsers,
      problemStatement,
      proposedFeatures,
      pricingModel,
    },
    fieldErrors,
    fields,
  };
}

/** `fieldErrors` への push ヘルパー。 */
export function pushFieldError(
  bag: Partial<Record<FieldName, string[]>>,
  field: FieldName,
  message: string,
): void {
  (bag[field] ??= []).push(message);
}

/**
 * NestJS `class-validator` の既定メッセージはフィールド名で始まる(例: "name should not be empty")。
 * 先頭トークンをフィールド名として一致を試み、当たれば `fieldErrors` に、外れれば `formErrors` に振る。
 *
 * Set はリクエスト毎に生成する(`'use server'` ファイルではモジュールスコープの mutable state を
 * 持たない、`react-doctor/server-no-mutable-module-state`)。
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
