'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import { generateDocument } from '@/lib/api/workspaces';
import type { GeneratableDocType } from '@/lib/api/types';

import {
  parseGenerateDocumentFormData,
  type GenerateDocumentFormState,
} from '../_shared/generate-document-form';

export type { GenerateDocumentFormState } from '../_shared/generate-document-form';

/**
 * DRAFT_GEN(README / LP の AI ドラフト生成)Server Action。成功時は生成された新 document の
 * 詳細ページへ redirect。append-only なので、既存 v1 が居ても v2 として並列に積まれる。
 */
export async function generateDocumentAction(
  slug: string,
  projectId: string,
  docType: GeneratableDocType,
  _prev: GenerateDocumentFormState,
  formData: FormData,
): Promise<GenerateDocumentFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseGenerateDocumentFormData(formData);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  let newId: string;
  try {
    const created = await generateDocument(slug, projectId, {
      docType,
      instructions: parsed.instructions,
    });
    newId = created.id;
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
          formError: 'プロジェクトが見つかりません。',
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
        formError: `ドキュメントの生成に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/documents`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  redirect(`/w/${slug}/projects/${projectId}/documents/${newId}`);
}
