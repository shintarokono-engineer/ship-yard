'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import type { ItemStatus } from '@/lib/api/types';
import { updateChecklistItem } from '@/lib/api/workspaces';

import {
  classifyApiMessages,
  parseChecklistItemFormData,
  type ChecklistItemFormState,
} from '../_shared/checklist-form';

export type { ChecklistItemFormState };

/**
 * ChecklistItem を編集ダイアログから部分更新する Server Action。
 *
 * - フォームから title / category / description / status を受け取って PATCH
 * - description は空文字なら `null` 明示送信(API 側 `UpdateChecklistItemDto` 仕様)
 * - 成功時は `{ ok: true }` を返し、ダイアログ側で useEffect により自動 close
 */
export async function updateChecklistItemAction(
  slug: string,
  projectId: string,
  itemId: string,
  _prev: ChecklistItemFormState,
  formData: FormData,
): Promise<ChecklistItemFormState> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseChecklistItemFormData(formData, { requireCategory: true });
  if (parsed.data === null) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  try {
    await updateChecklistItem(slug, projectId, itemId, {
      title: parsed.data.title,
      category: parsed.data.category,
      description: parsed.data.description.length > 0 ? parsed.data.description : null,
      status: parsed.data.status,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return {
          ok: false,
          formError: 'この項目を編集する権限がありません。',
          fields: parsed.fields,
        };
      }
      if (e.status === 404) {
        return {
          ok: false,
          formError: '項目が見つかりません。一覧を更新してから再度開いてください。',
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
        formError: `項目の更新に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/checklist`);
  return { ok: true };
}

/**
 * チェックボックスのクリックで status だけを切り替える軽量 Action(編集ダイアログを介さない)。
 *
 * `useActionState` を介さない直接呼び出し用なので、引数 / 戻り値を自由に設計する。
 * 失敗時は `{ ok: false, message }` を返し、呼び出し側で toast 通知する。
 */
export async function toggleChecklistItemStatusAction(
  slug: string,
  projectId: string,
  itemId: string,
  nextStatus: ItemStatus,
): Promise<{ ok: boolean; message?: string }> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, message: '認証が必要です。再度サインインしてください。' };
  }

  try {
    await updateChecklistItem(slug, projectId, itemId, { status: nextStatus });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return { ok: false, message: 'この項目を更新する権限がありません。' };
      }
      if (e.status === 404) {
        return { ok: false, message: '項目が見つかりません。' };
      }
      return { ok: false, message: `更新に失敗しました (HTTP ${e.status})` };
    }
    return { ok: false, message: '更新に失敗しました。' };
  }
  revalidatePath(`/w/${slug}/projects/${projectId}/checklist`);
  return { ok: true };
}
