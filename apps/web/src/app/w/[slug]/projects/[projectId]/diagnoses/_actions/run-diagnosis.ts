'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

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
 * 成功時は履歴一覧を revalidate し、`createdId` を返す。
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

  try {
    const score = await runDiagnosis(slug, projectId, parsed.instructions);
    revalidatePath(`/w/${slug}/projects/${projectId}/diagnoses`);
    revalidatePath(`/w/${slug}/projects/${projectId}`);
    return { ok: true, createdId: score.id, instructions: parsed.instructions };
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
}
