'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import { createRagQaSession } from '@/lib/api/workspaces';

import {
  parseCreateSessionFormData,
  type CreateSessionFormState,
} from '../_shared/start-session-form';

/**
 * RAG_QA(プロジェクト壁打ち)セッションを作成する Server Action。
 * 成功時はチャット画面 `/rag-qa/{sessionId}` へ redirect(useEffect + router.push の flash 回避)。
 * AI 呼び出しは無いので Free 上限には関与しない。
 */
export async function createSessionAction(
  slug: string,
  projectId: string,
  _prev: CreateSessionFormState,
  formData: FormData,
): Promise<CreateSessionFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseCreateSessionFormData(formData);
  if (parsed.fieldError) {
    return { ok: false, fieldError: parsed.fieldError, title: parsed.title };
  }

  let sessionId: string;
  try {
    const session = await createRagQaSession(slug, projectId, { title: parsed.title });
    sessionId = session.id;
  } catch (e) {
    if (e instanceof ApiError) {
      // classifyAiApiError は AI 機能向けヘルパーだが、ApiError → 種別の分類ロジック自体は汎用。
      // セッション作成は AI を呼ばないため quota_exceeded 分岐には到達しない(意図的に流用)。
      const classified = classifyAiApiError(e);
      if (classified.kind === 'forbidden') {
        return {
          ok: false,
          formError: classified.messages[0] ?? 'この操作は許可されていません。',
          title: parsed.title,
        };
      }
      if (classified.kind === 'not_found') {
        return { ok: false, formError: 'プロジェクトが見つかりません。', title: parsed.title };
      }
      if (classified.kind === 'bad_request') {
        return {
          ok: false,
          formError: classified.messages.join(' / ') || 'リクエストが不正です。',
          title: parsed.title,
        };
      }
      return {
        ok: false,
        formError: `セッションの作成に失敗しました (HTTP ${e.status})`,
        title: parsed.title,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/rag-qa`);
  redirect(`/w/${slug}/projects/${projectId}/rag-qa/${sessionId}`);
}
