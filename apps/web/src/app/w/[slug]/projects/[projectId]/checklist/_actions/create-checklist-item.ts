'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import type { Category } from '@/lib/api/types';
import { createChecklistItem } from '@/lib/api/workspaces';

import {
  classifyApiMessages,
  parseChecklistItemFormData,
  type ChecklistItemFormState,
} from '../_shared/checklist-form';

export type { ChecklistItemFormState };

/**
 * ChecklistItem を作成する Server Action。
 *
 * インラインフォームから呼ばれる前提で **category は bind 引数で渡される**(フォームには category 入力なし)。
 * 成功時は redirect せず `{ ok: true }` を返し、UI 側で入力欄をクリアして連続入力できるようにする。
 */
export async function createChecklistItemAction(
  slug: string,
  projectId: string,
  category: Category,
  _prev: ChecklistItemFormState,
  formData: FormData,
): Promise<ChecklistItemFormState> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  // category は bind 経由で確定しているので requireCategory=false。
  const parsed = parseChecklistItemFormData(formData, { requireCategory: false });
  if (parsed.data === null) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  try {
    await createChecklistItem(slug, projectId, {
      category,
      title: parsed.data.title,
      description: parsed.data.description.length > 0 ? parsed.data.description : undefined,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return {
          ok: false,
          formError: 'このプロジェクトに項目を追加する権限がありません。',
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
        formError: `項目の追加に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/checklist`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  return { ok: true };
}
