'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import type { SuggestionSource } from '@/lib/api/types';
import { createChecklistFromSuggestions } from '@/lib/api/workspaces';

import {
  parseSuggestionTasksFormData,
  type SuggestionTasksFormState,
} from '../_shared/suggestion-tasks-form';

export type { SuggestionTasksFormState } from '../_shared/suggestion-tasks-form';

/**
 * F17(改善提案 → ChecklistItem 変換)Server Action。
 *
 * 選んだ提案を 1 回の AI 呼び出しでまとめて分解し、最大 12 件を既存項目の後ろに追記する。
 * 成功時は revalidate するだけで redirect しない(Dialog 側で自動 close + toast)。
 *
 * 診断ページ / 検証ページ自体は変わらないので revalidate はチェックリストと
 * プロジェクト詳細の 2 本(`generate-checklist.ts` と同じ)。
 *
 * `source` / `sourceId` は呼び出し元のページが持つ確定値なので bind 引数で受け取り、
 * FormData には載せない(ユーザーが差し替えられる余地を作らない)。
 */
export async function createTasksFromSuggestionsAction(
  slug: string,
  projectId: string,
  source: SuggestionSource,
  sourceId: string,
  _prev: SuggestionTasksFormState,
  formData: FormData,
): Promise<SuggestionTasksFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseSuggestionTasksFormData(formData);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  try {
    const { items } = await createChecklistFromSuggestions(slug, projectId, {
      source,
      sourceId,
      indexes: parsed.indexes,
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
          formError: '診断結果が見つかりません。ページを再読み込みしてください。',
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
        formError: `タスクの作成に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }
}
