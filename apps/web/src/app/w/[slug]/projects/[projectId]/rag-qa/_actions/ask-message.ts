'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import { askRagQaMessage } from '@/lib/api/workspaces';

import { parseAskMessageFormData, type AskMessageFormState } from '../_shared/ask-message-form';

export type { AskMessageFormState } from '../_shared/ask-message-form';

/**
 * RAG_QA セッションに質問を送信する Server Action(Sonnet 4 で回答生成)。
 *
 * 成功時はチャット画面を revalidate し、Server Component 側が最新のメッセージ履歴を
 * 再取得する(楽観表示していた質問は実データに置き換わる)。生成結果そのものは
 * state に載せない(revalidate で取得するため)。Free プランは月 20 回上限。
 */
export async function askMessageAction(
  slug: string,
  projectId: string,
  sessionId: string,
  _prev: AskMessageFormState,
  formData: FormData,
): Promise<AskMessageFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseAskMessageFormData(formData);
  if (parsed.fieldError) {
    return { ok: false, formError: parsed.fieldError };
  }

  try {
    await askRagQaMessage(slug, projectId, sessionId, { question: parsed.question });
    revalidatePath(`/w/${slug}/projects/${projectId}/rag-qa/${sessionId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError) {
      const classified = classifyAiApiError(e);
      if (classified.kind === 'quota_exceeded') {
        return { ok: false, formError: classified.messages[0], quotaExceeded: true };
      }
      if (classified.kind === 'forbidden') {
        return {
          ok: false,
          formError: classified.messages[0] ?? 'この操作は許可されていません。',
        };
      }
      if (classified.kind === 'not_found') {
        return { ok: false, formError: 'セッションが見つかりません。' };
      }
      if (classified.kind === 'bad_request') {
        return {
          ok: false,
          formError: classified.messages.join(' / ') || 'リクエストが不正です。',
        };
      }
      if (classified.kind === 'bad_response') {
        return { ok: false, formError: classified.messages[0] };
      }
      return { ok: false, formError: `回答の生成に失敗しました (HTTP ${e.status})` };
    }
    throw e;
  }
}
