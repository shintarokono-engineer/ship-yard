'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import { generateChecklist } from '@/lib/api/workspaces';

import {
  parseGenerateChecklistFormData,
  type GenerateChecklistFormState,
} from '../_shared/generate-checklist-form';

export type { GenerateChecklistFormState } from '../_shared/generate-checklist-form';

/**
 * CHECKLIST_GEN(チェックリスト一括生成)Server Action。最大 30 件を `createManyAndReturn` で
 * 既存項目の後ろに追記する(連番 position)。成功時はページを revalidate するだけで redirect
 * しない(Dialog 側で自動 close + toast)。
 */
export async function generateChecklistAction(
  slug: string,
  projectId: string,
  _prev: GenerateChecklistFormState,
  formData: FormData,
): Promise<GenerateChecklistFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseGenerateChecklistFormData(formData);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  try {
    const { items } = await generateChecklist(slug, projectId, {
      instructions: parsed.instructions,
      categories: parsed.categories,
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
          formError: 'プロジェクトが見つかりません。',
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
        formError: `チェックリストの生成に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }
}
