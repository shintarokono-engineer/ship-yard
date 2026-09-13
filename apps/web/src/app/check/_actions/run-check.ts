'use server';

import { redirect } from 'next/navigation';

import { ApiError } from '@/lib/api/errors';
import { runPublicCheck } from '@/lib/api/public-check';
import { PUBLIC_CHECK_ERROR_CODE } from '@/lib/api/types';

import { parseCheckFormData, type CheckFormState } from '../_shared/check-form';

/** API のエラーボディから `code` を取り出す(BE の `PublicCheckDailyLimitError` 等が載せている)。 */
function errorCodeOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** `/check` の実行 Server Action(ADR-015)。成功時は結果ページへ redirect する。 */
export async function runCheckAction(
  _prev: CheckFormState,
  formData: FormData,
): Promise<CheckFormState> {
  void _prev;

  const parsed = parseCheckFormData(formData);
  if (parsed.error) {
    return { fieldError: parsed.error, ideaText: parsed.ideaText };
  }

  let resultId: string;
  try {
    const result = await runPublicCheck(parsed.ideaText);
    resultId = result.id;
  } catch (e) {
    if (e instanceof ApiError) {
      const code = errorCodeOf(e.body);

      // 上限到達は汎用の 429 文言で出さず、フォーム側でサインアップ導線を添える。
      if (code === PUBLIC_CHECK_ERROR_CODE.DAILY_LIMIT_REACHED) {
        return {
          formError:
            '本日の無料診断の枠は終了しました。アカウントを作成すると、待たずに 5 つすべての観点で診断できます。',
          limitReached: true,
          ideaText: parsed.ideaText,
        };
      }
      if (code === PUBLIC_CHECK_ERROR_CODE.IP_RATE_LIMITED) {
        return {
          formError: '短時間に実行しすぎです。しばらく待ってから再度お試しください。',
          ideaText: parsed.ideaText,
        };
      }
      if (e.status === 504) {
        return {
          formError: '診断が時間内に完了しませんでした。お手数ですが、もう一度お試しください。',
          ideaText: parsed.ideaText,
        };
      }
      return {
        formError: `診断に失敗しました (HTTP ${e.status})。時間をおいて再度お試しください。`,
        ideaText: parsed.ideaText,
      };
    }
    throw e;
  }

  // redirect は内部で例外を投げるため、**必ず try/catch の外**で呼ぶ。
  redirect(`/check/${resultId}`);
}
