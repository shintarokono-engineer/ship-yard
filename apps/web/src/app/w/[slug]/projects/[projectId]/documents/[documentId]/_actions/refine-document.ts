'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import { refineDocument } from '@/lib/api/workspaces';

import {
  parseRefineDocumentFormData,
  type RefineDocumentFormState,
} from '../_shared/refine-document-form';

export type { RefineDocumentFormState } from '../_shared/refine-document-form';

/**
 * REFINE_DOC(AI による ProjectDocument 推敲)Server Action。
 *
 * Sonnet 4 + Tool Use で推敲し、append-only で新版を作成する(Day 10 の edit に乗る)。
 * 成功時は新版の id にリダイレクトしてユーザーは「最新 version」を見る(edit-document と同じ思想)。
 */
export async function refineDocumentAction(
  slug: string,
  projectId: string,
  documentId: string,
  _prev: RefineDocumentFormState,
  formData: FormData,
): Promise<RefineDocumentFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseRefineDocumentFormData(formData);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  let newId: string;
  try {
    const next = await refineDocument(slug, projectId, documentId, { goal: parsed.goal });
    newId = next.id;
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
          formError: 'ドキュメントが見つかりません。一覧に戻って再度開いてください。',
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
        formError: `ドキュメントの推敲に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/documents`);
  revalidatePath(`/w/${slug}/projects/${projectId}/documents/${documentId}`);
  revalidatePath(`/w/${slug}/projects/${projectId}/documents/${newId}`);
  // 新版の URL に切り替えて、ユーザーは推敲後の最新 version を見る。
  redirect(`/w/${slug}/projects/${projectId}/documents/${newId}`);
}
