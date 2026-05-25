'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import { splitChecklistItem } from '@/lib/api/workspaces';

import { parseSplitTaskFormData, type SplitTaskFormState } from '../_shared/split-task-form';

export type { SplitTaskFormState } from '../_shared/split-task-form';

/**
 * TASK_SPLIT(親 ChecklistItem の AI 分解)Server Action。
 *
 * Haiku 4.5 + Tool Use で生成した子サブタスクを `parentId` 付きで既存項目の末尾に追加する。
 * 同ページに留まり revalidate するだけで redirect しない(Dialog 側で自動 close + toast)。
 */
export async function splitTaskAction(
  slug: string,
  projectId: string,
  itemId: string,
  _prev: SplitTaskFormState,
  formData: FormData,
): Promise<SplitTaskFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseSplitTaskFormData(formData);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  try {
    const { items } = await splitChecklistItem(slug, projectId, itemId, {
      instructions: parsed.instructions,
    });
    revalidatePath(`/w/${slug}/projects/${projectId}/checklist`);
    revalidatePath(`/w/${slug}/projects/${projectId}`);
    return { ok: true, generatedCount: items.length, fields: parsed.fields };
  } catch (e) {
    if (e instanceof ApiError) {
      const classified = classifyAiApiError(e);
      if (classified.kind === 'quota_exceeded') {
        return {
          ok: false,
          formError: classified.messages[0],
          quotaExceeded: true,
          fields: parsed.fields,
        };
      }
      if (classified.kind === 'forbidden') {
        return { ok: false, formError: classified.messages[0], fields: parsed.fields };
      }
      if (classified.kind === 'not_found') {
        return {
          ok: false,
          formError: 'タスクが見つかりません。ページを再読み込みしてください。',
          fields: parsed.fields,
        };
      }
      if (classified.kind === 'bad_request') {
        const message = classified.messages.join(' / ') || 'リクエストが不正です。';
        return { ok: false, formError: message, fields: parsed.fields };
      }
      if (classified.kind === 'bad_response') {
        return { ok: false, formError: classified.messages[0], fields: parsed.fields };
      }
      return {
        ok: false,
        formError: `タスクの分解に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }
}
