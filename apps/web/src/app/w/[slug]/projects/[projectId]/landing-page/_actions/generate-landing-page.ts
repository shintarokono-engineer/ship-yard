'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { classifyAiApiError } from '@/app/w/[slug]/_shared/ai-form';
import { ApiError } from '@/lib/api/errors';
import { generateLandingPage } from '@/lib/api/workspaces';

import { parseGenerateLpFormData, type GenerateLpFormState } from '../_shared/generate-lp-form';

export type { GenerateLpFormState } from '../_shared/generate-lp-form';

/**
 * LP ブロック生成(ADR-009)Server Action。Sonnet 4 + Tool Use で LP をブロック構造として生成し、
 * `LandingPage` に upsert する。1 プロジェクト = 1 LP のため、既存 LP があれば上書き(再生成)。
 *
 * 成功時は redirect せず `revalidatePath` で同一プレビューページを再描画し、`ok: true` を返す
 * (Dialog 側が `ok` を見て自身を閉じる)。
 */
export async function generateLandingPageAction(
  slug: string,
  projectId: string,
  _prev: GenerateLpFormState,
  formData: FormData,
): Promise<GenerateLpFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseGenerateLpFormData(formData);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  try {
    await generateLandingPage(slug, projectId, { instructions: parsed.instructions });
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
        return { ok: false, formError: 'プロジェクトが見つかりません。', fields: parsed.fields };
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
        formError: `ランディングページの生成に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/landing-page`);
  revalidatePath(`/w/${slug}/projects/${projectId}`);
  return { ok: true };
}
