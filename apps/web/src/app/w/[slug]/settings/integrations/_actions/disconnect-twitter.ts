'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/errors';
import { disconnectTwitterAccount } from '@/lib/api/integrations';

export interface DisconnectTwitterFormState {
  ok: boolean;
  formError?: string;
}

export const INITIAL_DISCONNECT_TWITTER_FORM_STATE: DisconnectTwitterFormState = { ok: false };

/**
 * Twitter (X) アカウント連携を切断する Server Action(ADR-014)。
 *
 * BE 側で X の revoke API を best-effort で呼び、ローカル DB の TwitterAccount を削除する。
 * 既に削除済みでも冪等に `{ ok: true }` が返るため、二度押し / race condition でも UI を壊さない。
 */
export async function disconnectTwitterAction(
  slug: string,
  accountId: string,
  _prev: DisconnectTwitterFormState,
): Promise<DisconnectTwitterFormState> {
  void _prev;
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  try {
    await disconnectTwitterAccount(slug, accountId);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return { ok: false, formError: '連携を切断する権限がありません(OWNER / ADMIN のみ)。' };
      }
      return {
        ok: false,
        formError: `連携の切断に失敗しました (HTTP ${e.status})`,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/settings/integrations`);
  return { ok: true };
}
