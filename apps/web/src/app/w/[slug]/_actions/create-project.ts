'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import { createProject } from '@/lib/api/workspaces';

import {
  classifyApiMessages,
  parseProjectFormData,
  type ProjectFormState,
} from '../_shared/project-form';

// 型は erase されるので 'use server' ファイルからも export 可。
// ランタイム値(オブジェクトや変数)を export しようとすると Next.js が
// `A "use server" file can only export async functions` で拒否するため、
// 初期値定数 `INITIAL_PROJECT_FORM_STATE` は `_shared/project-form.ts` 側に置く。
export type { ProjectFormState };

/**
 * 新規プロジェクトを作成し、詳細ページにリダイレクトする Server Action。
 *
 * - サーバー側でも最低限のバリデーションを行う(`parseProjectFormData`)
 * - API 由来の 400 メッセージは `classifyApiMessages` でフィールド名プレフィックスを
 *   見てフィールドエラー / 全体エラーに振り分け
 * - 成功時は `revalidatePath` で一覧をリフレッシュしてから詳細にリダイレクト
 */
export async function createProjectAction(
  slug: string,
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  // Defense in Depth: 下流の apiFetch でも 401 を返すが、Server Action の入口でも
  // 早期に認証を確認することでバリデーション等の無駄な処理を避け、エラーメッセージも明瞭に。
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseProjectFormData(formData);
  if (parsed.data === null) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  let projectId: string;
  try {
    const project = await createProject(slug, {
      name: parsed.data.name,
      description: parsed.data.description.length > 0 ? parsed.data.description : undefined,
      status: parsed.data.status,
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
          fields: parsed.fields,
        };
      }
      return {
        ok: false,
        formError: `プロジェクトの作成に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}`);
  redirect(`/w/${slug}/projects/${projectId}`);
}
