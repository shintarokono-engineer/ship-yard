'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import { updateProject } from '@/lib/api/workspaces';

import {
  classifyApiMessages,
  parseProjectFormData,
  type ProjectFormState,
} from '../../../_shared/project-form';

export type { ProjectFormState };

/**
 * プロジェクトを部分更新する Server Action。
 *
 * - 成功時は **リダイレクトせず** `{ ok: true }` を返す(ダイアログ側で `useEffect` で
 *   検知して自動 close する設計)。`revalidatePath` で一覧と詳細をリフレッシュする
 * - 失敗時は `create-project.ts` と同じ `ProjectFormState` を返す(共通ダイアログ部品が再表示)
 * - `description` が空文字に変更されたときは `null` 明示で API に送り、列を null クリアする
 *   (apps/api `UpdateProjectDto` のセマンティクスに合わせる)
 */
export async function updateProjectAction(
  slug: string,
  projectId: string,
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseProjectFormData(formData);
  if (parsed.data === null) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  try {
    await updateProject(slug, projectId, {
      name: parsed.data.name,
      // 空文字は「null クリア」として扱う(編集で説明を消したいケース)。
      description: parsed.data.description.length > 0 ? parsed.data.description : null,
      status: parsed.data.status,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return {
          ok: false,
          formError: 'このプロジェクトを編集する権限がありません。',
          fields: parsed.fields,
        };
      }
      if (e.status === 404) {
        return {
          ok: false,
          formError: 'プロジェクトが見つかりません。一覧に戻って再度開いてください。',
          fields: parsed.fields,
        };
      }
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
        formError: `プロジェクトの更新に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  return { ok: true };
}
