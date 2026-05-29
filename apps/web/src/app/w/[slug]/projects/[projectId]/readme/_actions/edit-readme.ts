'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import { editDocument } from '@/lib/api/workspaces';

import {
  classifyApiMessages,
  parseReadmeFormData,
  type ReadmeFormState,
} from '../_shared/readme-form';

export type { ReadmeFormState };

/**
 * README を編集する Server Action(append-only)。
 *
 * §9.12.4(2026-05-29)で `documents/[documentId]/_actions/edit-document.ts` から README 専用に移植。
 * API 側で **既存行は変更されず新しい version の行が INSERT** される。成功時は `/readme` に
 * redirect し、Server Component が最新 version を表示する。
 */
export async function editReadmeAction(
  slug: string,
  projectId: string,
  documentId: string,
  _prev: ReadmeFormState,
  formData: FormData,
): Promise<ReadmeFormState> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseReadmeFormData(formData);
  if (parsed.data === null) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  try {
    await editDocument(slug, projectId, documentId, {
      title: parsed.data.title,
      content: parsed.data.content,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return {
          ok: false,
          formError: 'この README を編集する権限がありません。',
          fields: parsed.fields,
        };
      }
      if (e.status === 404) {
        return {
          ok: false,
          formError: 'README が見つかりません。ページを再読み込みしてください。',
          fields: parsed.fields,
        };
      }
      const msgs = extractValidationMessages(e.body);
      if (msgs.length > 0) {
        const classified = classifyApiMessages(msgs);
        return {
          ok: false,
          fieldErrors: classified.fieldErrors,
          formError:
            classified.formErrors.length > 0 ? classified.formErrors.join(' / ') : undefined,
          fields: parsed.fields,
        };
      }
      return {
        ok: false,
        formError: `README の更新に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/readme`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  // 最新 version は Server Component が自動表示するため、`?v=` は付けずに `/readme` に戻す。
  redirect(`/w/${slug}/projects/${projectId}/readme`);
}
