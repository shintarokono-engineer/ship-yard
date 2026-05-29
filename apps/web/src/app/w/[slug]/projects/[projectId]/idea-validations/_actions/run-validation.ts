'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

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
 *
 * 成功時は `redirect()` で結果ページへ遷移する。useEffect + router.push の anti-pattern を避け、
 * Next.js dev の遅延コンパイル(初回 visit でルートをコンパイルする方式)と Server Action 後の
 * クライアント遷移のレースコンディションによる「初回 404 → リロードで表示」 問題を回避する。
 * `redirect()` は try/catch の外で呼ぶこと(catch で redirect の内部 throw を握りつぶさないため)。
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

  let createdId: string;
  try {
    const validation = await runIdeaValidation(slug, projectId, parsed.instructions);
    createdId = validation.id;
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

  // 成功時:キャッシュを無効化して結果ページへ遷移する。redirect は内部で throw するので、
  // この行より下のコードには到達しない(Next.js フレームワークが redirect を処理して 303 を返す)。
  revalidatePath(`/w/${slug}/projects/${projectId}/idea-validations`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  redirect(`/w/${slug}/projects/${projectId}/idea-validations/${createdId}`);
}
