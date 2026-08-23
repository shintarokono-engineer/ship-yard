'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import { generateDocument } from '@/lib/api/workspaces';

import {
  parseGenerateReadmeFormData,
  type GenerateReadmeFormState,
} from '../_shared/generate-readme-form';

export type { GenerateReadmeFormState } from '../_shared/generate-readme-form';

/**
 * DRAFT_GEN(README の AI ドラフト生成)Server Action。
 *
 * §9.12.4(2026-05-29)で `documents/_actions/generate-document.ts` から README 専用に移植
 * (kind パラメータ削除、常に `README` を送る)。append-only なので既存 v1 が居ても v2 として
 * 並列に積まれ、`/readme` は最新 version を表示する。
 *
 * 成功時は **`{ ok: true }` を返すだけで redirect しない**(LP / チェックリスト生成と同じ形)。
 * `redirect()` だとクライアントに成功状態が返らず、Dialog 側で生成完了を計測できないため。
 * `/readme` への遷移は Dialog が `router.push` で行う。
 */
export async function generateReadmeAction(
  slug: string,
  projectId: string,
  _prev: GenerateReadmeFormState,
  formData: FormData,
): Promise<GenerateReadmeFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseGenerateReadmeFormData(formData);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  try {
    await generateDocument(slug, projectId, {
      docType: 'README',
      instructions: parsed.instructions,
    });
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
        formError: `README の生成に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/readme`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  return { ok: true };
}
