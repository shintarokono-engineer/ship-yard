'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import { runIdeaValidation } from '@/lib/api/workspaces';

import {
  parseRunValidationFormData,
  type RunValidationFormState,
} from '../_shared/run-validation-form';

export type { RunValidationFormState } from '../_shared/run-validation-form';

/**
 * アイデア検証(IDEA_VALIDATION)を実行する Server Action。
 *
 * Project 詳細情報フィールドが空の場合は BE が 400 を返す → `bad_request` として表示。
 * クレジット上限超過は `classifyAiApiError` で `quota_exceeded` に分類し、UI でアップグレード導線を出す。
 * 成功時は履歴一覧を revalidate し、`createdId` を返す(Dialog 側が結果ページへ遷移)。
 */
export async function runValidationAction(
  slug: string,
  projectId: string,
  _prev: RunValidationFormState,
  formData: FormData,
): Promise<RunValidationFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseRunValidationFormData(formData);
  if (parsed.fieldError) {
    return { ok: false, fieldError: parsed.fieldError, instructions: parsed.instructions };
  }

  try {
    const validation = await runIdeaValidation(slug, projectId, parsed.instructions);
    revalidatePath(`/w/${slug}/projects/${projectId}/idea-validations`);
    revalidatePath(`/w/${slug}/projects/${projectId}`);
    return { ok: true, createdId: validation.id, instructions: parsed.instructions };
  } catch (e) {
    if (e instanceof ApiError) {
      const classified = classifyAiApiError(e);
      if (classified.kind === 'quota_exceeded') {
        return {
          ok: false,
          formError: classified.messages[0],
          quotaExceeded: true,
          instructions: parsed.instructions,
        };
      }
      if (classified.kind === 'forbidden') {
        return {
          ok: false,
          formError: classified.messages[0] ?? 'この操作は許可されていません。',
          instructions: parsed.instructions,
        };
      }
      if (classified.kind === 'not_found') {
        return {
          ok: false,
          formError: 'プロジェクトが見つかりません。',
          instructions: parsed.instructions,
        };
      }
      if (classified.kind === 'bad_request') {
        return {
          ok: false,
          formError:
            classified.messages.join(' / ') ||
            'プロジェクトの詳細情報(課題・ターゲット等)が未入力です。先に詳細情報を入力してください。',
          instructions: parsed.instructions,
        };
      }
      if (classified.kind === 'bad_response') {
        return {
          ok: false,
          formError: classified.messages[0],
          instructions: parsed.instructions,
        };
      }
      return {
        ok: false,
        formError: `アイデア検証の実行に失敗しました (HTTP ${e.status})`,
        instructions: parsed.instructions,
      };
    }
    throw e;
  }
}
