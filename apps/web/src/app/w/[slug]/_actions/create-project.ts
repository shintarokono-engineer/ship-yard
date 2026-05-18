'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import { PROJECT_STATUSES, type ProjectStatus } from '@/lib/api/types';
import { createProject } from '@/lib/api/workspaces';

const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 20_000;

/** バリデーション対象フィールド。 */
const FORM_FIELDS = ['name', 'description', 'status'] as const;
type FieldName = (typeof FORM_FIELDS)[number];

/**
 * Server Action のフォーム状態。
 *
 * **重要**: `'use server'` ファイルはランタイム値(オブジェクトや変数)を export できない
 * (Next.js が `A "use server" file can only export async functions` で拒否する)。
 * 型は erase されるので export 可。初期値定数はコンシューマ側(`new-project-dialog.tsx`)で
 * 定義する。
 */
export interface CreateProjectFormState {
  ok: boolean;
  /** フィールド単位のエラー(該当 Input の直下に表示)。 */
  fieldErrors?: Partial<Record<FieldName, string[]>>;
  /** フィールドに紐付かない全体エラー(HTTP 500 や認可エラー等、フッター付近に表示)。 */
  formError?: string;
  /** エラー時に入力値を保持して再表示するためのスナップショット。 */
  fields?: { name?: string; description?: string; status?: string };
}

/**
 * 新規プロジェクトを作成し、詳細ページにリダイレクトする Server Action。
 *
 * - サーバー側でも最低限のバリデーションを行う(クライアントの HTML 制約をすり抜けても弾く)
 * - API 由来の 400 メッセージはフィールド名プレフィックス(`class-validator` 既定)で
 *   振り分けてフィールドエラーに、振り分けられないものは `formError` に入れる
 * - 成功時は `revalidatePath` で一覧をリフレッシュしてから詳細にリダイレクト
 */
export async function createProjectAction(
  slug: string,
  _prev: CreateProjectFormState,
  formData: FormData,
): Promise<CreateProjectFormState> {
  // Defense in Depth: 下流の apiFetch でも 401 を返すが、Server Action の入口でも
  // 早期に認証を確認することでバリデーション等の無駄な処理を避け、エラーメッセージも明瞭に。
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const statusRaw = String(formData.get('status') ?? '').trim();
  const status = (PROJECT_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as ProjectStatus)
    : undefined;

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
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, fields: { name, description, status: statusRaw } };
  }

  let projectId: string;
  try {
    const project = await createProject(slug, {
      name,
      description: description.length > 0 ? description : undefined,
      status,
    });
    projectId = project.id;
  } catch (e) {
    if (e instanceof ApiError) {
      const msgs = extractValidationMessages(e.body);
      if (msgs.length > 0) {
        const classified = classifyApiMessages(msgs);
        return {
          ok: false,
          fieldErrors: classified.fieldErrors,
          formError:
            classified.formErrors.length > 0 ? classified.formErrors.join(' / ') : undefined,
          fields: { name, description, status: statusRaw },
        };
      }
      return {
        ok: false,
        formError: `プロジェクトの作成に失敗しました (HTTP ${e.status})`,
        fields: { name, description, status: statusRaw },
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}`);
  redirect(`/w/${slug}/projects/${projectId}`);
}

function pushFieldError(
  bag: Partial<Record<FieldName, string[]>>,
  field: FieldName,
  message: string,
): void {
  if (!bag[field]) bag[field] = [];
  bag[field]!.push(message);
}

/**
 * NestJS `class-validator` の既定メッセージはフィールド名で始まる(例: "name should not be empty")。
 * 先頭トークンをフィールド名として一致を試み、当たれば fieldErrors に、外れれば formErrors に振る。
 */
function classifyApiMessages(messages: string[]): {
  fieldErrors: Partial<Record<FieldName, string[]>>;
  formErrors: string[];
} {
  // Set はリクエスト毎に生成する
  // ('use server' ファイルではモジュールスコープのmutable state を持たない、`react-doctor/server-no-mutable-module-state`)。
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
