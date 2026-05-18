'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError } from '@/lib/api/errors';
import { deleteProject } from '@/lib/api/workspaces';

/**
 * 削除フォームの状態。`update-project.ts` の `ProjectFormState` とは関心が違う
 * (フィールドエラーが無い)ので独立した型にする。
 */
export interface DeleteProjectFormState {
  ok: boolean;
  formError?: string;
}

/**
 * プロジェクトを削除し、一覧ページにリダイレクトする Server Action。
 *
 * - 子リソース(ChecklistItem / ProjectDocument)が連鎖削除されるので、UI 側で
 *   確認ダイアログを必須にして誤操作を防ぐ
 * - 成功時は `/w/{slug}` にリダイレクト。失敗時のみ state を返す
 */
export async function deleteProjectAction(
  slug: string,
  projectId: string,
  _prev: DeleteProjectFormState,
  _formData: FormData,
): Promise<DeleteProjectFormState> {
  // `useActionState` のシグネチャ制約で `_prev` / `_formData` の受け取りは必須だが
  // 削除フローでは参照しない。`void` 演算子で「使用済み」にして no-unused-vars を回避。
  void _prev;
  void _formData;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  try {
    await deleteProject(slug, projectId);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return { ok: false, formError: 'このプロジェクトを削除する権限がありません。' };
      }
      if (e.status === 404) {
        return { ok: false, formError: 'プロジェクトが見つかりません。' };
      }
      return { ok: false, formError: `プロジェクトの削除に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}`);
  redirect(`/w/${slug}`);
}
