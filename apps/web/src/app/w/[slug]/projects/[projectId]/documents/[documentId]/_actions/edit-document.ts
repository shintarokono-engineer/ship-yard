'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import { editDocument } from '@/lib/api/workspaces';

import {
  classifyApiMessages,
  parseDocumentFormData,
  type DocumentFormState,
} from '../_shared/document-form';

export type { DocumentFormState };

/**
 * ProjectDocument を編集する Server Action(append-only)。
 *
 * API 側で **既存行は変更されず新しい version の行が INSERT** される。成功時は新版の
 * id にリダイレクトして、ユーザーは「最新の version を見ている」状態になる。
 */
export async function editDocumentAction(
  slug: string,
  projectId: string,
  documentId: string,
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseDocumentFormData(formData);
  if (parsed.data === null) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  let newId: string;
  try {
    const next = await editDocument(slug, projectId, documentId, {
      title: parsed.data.title,
      content: parsed.data.content,
    });
    newId = next.id;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return {
          ok: false,
          formError: 'このドキュメントを編集する権限がありません。',
          fields: parsed.fields,
        };
      }
      if (e.status === 404) {
        return {
          ok: false,
          formError: 'ドキュメントが見つかりません。一覧に戻って再度開いてください。',
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
        formError: `ドキュメントの更新に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/documents`);
  revalidatePath(`/w/${slug}/projects/${projectId}/documents/${documentId}`);
  revalidatePath(`/w/${slug}/projects/${projectId}/documents/${newId}`);
  // 新版の URL に切り替えて、ユーザーは最新 version を見る。
  redirect(`/w/${slug}/projects/${projectId}/documents/${newId}`);
}
