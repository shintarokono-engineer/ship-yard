'use server';

import { auth } from '@clerk/nextjs/server';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import { summarizeRagQaSession } from '@/lib/api/workspaces';

import {
  parseSessionSummaryFormData,
  type SessionSummaryFormState,
} from '../_shared/session-summary-form';

export type { SessionSummaryFormState } from '../_shared/session-summary-form';

/**
 * 生成ステップ。壁打ちの記録から概要文の候補を作る。
 * DB は変わらないので `revalidatePath` は呼ばない(保存は `apply-description.ts`)。
 */
export async function summarizeSessionAction(
  slug: string,
  projectId: string,
  sessionId: string,
  _prev: SessionSummaryFormState,
  formData: FormData,
): Promise<SessionSummaryFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseSessionSummaryFormData(formData);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  try {
    const result = await summarizeRagQaSession(slug, projectId, sessionId, {
      instructions: parsed.instructions,
    });
    return {
      ok: true,
      description: result.description,
      currentDescription: result.currentDescription,
      transcriptTruncated: result.transcriptTruncated,
      descriptionTruncated: result.descriptionTruncated,
      fields: parsed.fields,
    };
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
          formError: 'セッションが見つかりません。ページを再読み込みしてください。',
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
        formError: `概要の生成に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }
}
