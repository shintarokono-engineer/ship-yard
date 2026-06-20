'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import { executeDelivery } from '@/lib/api/announcements';
import { ApiError, extractValidationMessages } from '@/lib/api/errors';

export interface ExecuteDeliveryFormState {
  ok: boolean;
  formError?: string;
}

export const INITIAL_EXECUTE_DELIVERY_FORM_STATE: ExecuteDeliveryFormState = { ok: false };

/**
 * Delivery を実行する Server Action(ADR-014 §3、MVP は同期即時)。
 *
 * - Twitter:アカウント未連携 → 403、X API エラー → 502、成功 → SENT + externalRef
 * - Blog:publishedAt セット → SENT + externalRef = BlogPost.id
 *
 * BE 側で失敗時は Delivery.status = FAILED + error にユーザー向け文言を保存しているので、
 * 再描画時にユーザーがフォールバック文言を確認できる。Action 自体はそのまま結果を返す。
 */
export async function executeDeliveryAction(
  slug: string,
  projectId: string,
  id: string,
  deliveryId: string,
  _prev: ExecuteDeliveryFormState,
): Promise<ExecuteDeliveryFormState> {
  void _prev;
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  try {
    await executeDelivery(slug, projectId, id, deliveryId);
  } catch (e) {
    if (e instanceof ApiError) {
      const msgs = extractValidationMessages(e.body);
      // 403:X アカウント未連携 / 権限不足
      if (e.status === 403) {
        return {
          ok: false,
          formError: msgs[0] || 'この配信を実行する権限がありません。',
        };
      }
      if (e.status === 404) {
        return { ok: false, formError: '配信が見つかりません。' };
      }
      if (e.status === 502) {
        return {
          ok: false,
          formError: msgs[0] || '外部サービスへの配信に失敗しました。時間を置いて再度お試しください。',
        };
      }
      return {
        ok: false,
        formError: `配信の実行に失敗しました (HTTP ${e.status})`,
      };
    }
    throw e;
  }

  revalidatePath(`/w/${slug}/projects/${projectId}/announcements/${id}`);
  revalidatePath(`/w/${slug}/projects/${projectId}/announcements`);
  return { ok: true };
}
