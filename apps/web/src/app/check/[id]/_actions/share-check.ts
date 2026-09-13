'use server';

import { revalidatePath } from 'next/cache';

import { sharePublicCheck } from '@/lib/api/public-check';

/**
 * 結果の共有を opt-in で有効にする Server Action(ADR-015)。未認証で呼べる。
 *
 * 失敗しても投げない。コピーの副作用として実行されるため、ここで例外を出すと
 * **コピーは成功しているのにエラー画面になる**。
 */
export async function enableSharingAction(id: string): Promise<void> {
  try {
    await sharePublicCheck(id);
    revalidatePath(`/check/${id}`);
  } catch {
    // 意図的に握りつぶす。
  }
}
