'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import { refineDocument } from '@/lib/api/workspaces';

import {
  parseRefineReadmeFormData,
  type RefineReadmeFormState,
} from '../_shared/refine-readme-form';

export type { RefineReadmeFormState } from '../_shared/refine-readme-form';

/**
 * REFINE_DOC(AI による README 推敲)Server Action。
 *
 * §9.12.4(2026-05-29)で `documents/[documentId]/_actions/refine-document.ts` から README 専用に移植。
 * Sonnet 4 + Tool Use で推敲し、append-only で新版を作成する(Day 10 の edit に乗る)。成功時は
 * `/readme` に redirect し、Server Component が最新 version(= 推敲後)を表示する。
 */
export async function refineReadmeAction(
  slug: string,
  projectId: string,
  documentId: string,
  _prev: RefineReadmeFormState,
  formData: FormData,
): Promise<RefineReadmeFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseRefineReadmeFormData(formData);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  try {
    await refineDocument(slug, projectId, documentId, { goal: parsed.goal });
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
          formError: 'README が見つかりません。ページを再読み込みしてください。',
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
        formError: `README の推敲に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/readme`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  redirect(`/w/${slug}/projects/${projectId}/readme`);
}
