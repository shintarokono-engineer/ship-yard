'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { createInvitation } from '@/lib/api/invitations';
import { ApiError, extractValidationMessages } from '@/lib/api/errors';

import {
  classifyApiMessages,
  parseInvitationFormData,
  type InvitationFormState,
} from '../_shared/invitation-form';

// 型は erase されるので 'use server' ファイルからも export 可。
export type { InvitationFormState };

/**
 * 招待発行 Server Action。
 *
 * 成功時は `ok: true` + `mailSent` フラグを返し、ダイアログ側で自動 close + toast を出す。
 * BE は 400(DTO) / 401 / 403(非 ADMIN) / 404(slug 不在) を返しうる。
 */
export async function createInvitationAction(
  slug: string,
  _prev: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  const parsed = parseInvitationFormData(formData);
  if (parsed.data === null) {
    return { ok: false, fieldErrors: parsed.fieldErrors, fields: parsed.fields };
  }

  let mailSent: boolean;
  let invitedEmail: string;
  try {
    const result = await createInvitation(slug, parsed.data);
    mailSent = result.mailSent;
    invitedEmail = result.invitation.email;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return {
          ok: false,
          formError: 'メンバーを招待する権限がありません。',
          fields: parsed.fields,
        };
      }
      if (e.status === 404) {
        return {
          ok: false,
          formError: 'ワークスペースが見つかりません。',
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
        formError: `招待の発行に失敗しました (HTTP ${e.status})`,
        fields: parsed.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/settings/members`);
  return { ok: true, mailSent, invitedEmail };
}
