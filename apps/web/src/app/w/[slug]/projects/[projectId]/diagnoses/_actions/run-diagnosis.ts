'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import { runDiagnosis } from '@/lib/api/workspaces';

import {
  parseRunDiagnosisFormData,
  type RunDiagnosisFormState,
} from '../_shared/run-diagnosis-form';

export type { RunDiagnosisFormState } from '../_shared/run-diagnosis-form';

/**
 * プロダクト診断(PRODUCT_DIAGNOSIS)を実行する Server Action。
 *
 * IN_DEV 以降のプロジェクトを対象に、5 軸でサービスレベルをスコア化する。
 * クレジット上限超過は `classifyAiApiError` で `quota_exceeded` に分類し、UI でアップグレード導線を出す。
 *
 * 成功時は `redirect()` で結果ページへ遷移する。useEffect + router.push の anti-pattern を避け、
 * Next.js dev の遅延コンパイル(初回 visit でルートをコンパイルする方式)と Server Action 後の
 * クライアント遷移のレースコンディションによる「初回 404 → リロードで表示」 問題を回避する。
 * `redirect()` は try/catch の外で呼ぶこと(catch で redirect の内部 throw を握りつぶさないため)。
 */
export async function runDiagnosisAction(
  slug: string,
  projectId: string,
  _prev: RunDiagnosisFormState,
  formData: FormData,
): Promise<RunDiagnosisFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseRunDiagnosisFormData(formData);
  if (parsed.fieldError) {
    return { ok: false, fieldError: parsed.fieldError, instructions: parsed.instructions };
  }

  let createdId: string;
  try {
    const score = await runDiagnosis(slug, projectId, parsed.instructions);
    createdId = score.id;
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
          formError: classified.messages.join(' / ') || 'リクエストが不正です。',
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
        formError: `プロダクト診断の実行に失敗しました (HTTP ${e.status})`,
        instructions: parsed.instructions,
      };
    }
    throw e;
  }

  // 成功時:キャッシュを無効化して結果ページへ遷移する。redirect は内部で throw するので、
  // この行より下のコードには到達しない(Next.js フレームワークが redirect を処理して 303 を返す)。
  revalidatePath(`/w/${slug}/projects/${projectId}/diagnoses`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  redirect(`/w/${slug}/projects/${projectId}/diagnoses/${createdId}`);
}
