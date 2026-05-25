'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import { createWorkspace } from '@/lib/api/workspaces';

import {
  classifyApiMessages,
  parseOnboardingFormData,
  type OnboardingFormState,
} from '../_shared/onboarding-form';

export type { OnboardingFormState } from '../_shared/onboarding-form';

/**
 * ワークスペース新規作成 Server Action。成功時は `/w/{slug}` に redirect。
 *
 * API のエラー振り分け:
 * - 400(class-validator):field errors に振り分け
 * - 403(User 未同期):form error「ユーザー情報の同期待ちです。少し待って再試行してください。」
 * - 409(slug 衝突):slug field error
 * - その他:汎用 form error
 */
export async function createWorkspaceAction(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  void _prev;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseOnboardingFormData(formData);
  if (Object.keys(parsed.fieldErrors).length > 0 || !parsed.data) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  let workspaceSlug: string;
  try {
    const res = await createWorkspace(parsed.data);
    workspaceSlug = res.tenant.slug;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 400) {
        const messages = extractValidationMessages(e.body);
        const classified = classifyApiMessages(messages);
        return {
          ok: false,
          fieldErrors: classified.fieldErrors,
          formError: classified.formErrors.join(' / ') || undefined,
          fields: parsed.fields,
        };
      }
      if (e.status === 403) {
        return {
          ok: false,
          formError: 'ユーザー情報の同期待ちです。少し時間を置いてから再度お試しください。',
          fields: parsed.fields,
        };
      }
      if (e.status === 409) {
        return {
          ok: false,
          fieldErrors: {
            slug: ['この URL はすでに使われています。別の URL を指定してください。'],
          },
          fields: parsed.fields,
        };
      }
      return {
        ok: false,
        formError: `ワークスペースの作成に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath('/');
  redirect(`/w/${workspaceSlug}`);
}
