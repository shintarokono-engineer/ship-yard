'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import { updateProject } from '@/lib/api/workspaces';

import {
  parseApplyDescriptionFormData,
  type ApplyDescriptionFormState,
} from '../_shared/session-summary-form';

export type { ApplyDescriptionFormState } from '../_shared/session-summary-form';

/**
 * 壁打ち要約の保存ステップ。プレビューで確認・編集した概要を `Project.description` に保存する。
 *
 * `updateProjectAction` は使わない(全フォームを送るため他フィールドを巻き込む)。
 * `UpdateProjectDto` は部分更新なので description だけを送る。
 */
export async function applyDescriptionAction(
  slug: string,
  projectId: string,
  _prev: ApplyDescriptionFormState,
  formData: FormData,
): Promise<ApplyDescriptionFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseApplyDescriptionFormData(formData);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return { ok: false, fieldErrors: parsed.fieldErrors };
  }

  try {
    await updateProject(slug, projectId, { description: parsed.description });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return { ok: false, formError: 'このプロジェクトを編集する権限がありません。' };
      }
      if (e.status === 404) {
        return {
          ok: false,
          formError: 'プロジェクトが見つかりません。ページを再読み込みしてください。',
        };
      }
      const msgs = extractValidationMessages(e.body);
      if (msgs.length > 0) {
        return { ok: false, fieldErrors: { description: msgs } };
      }
      return { ok: false, formError: `概要の保存に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  return { ok: true };
}
