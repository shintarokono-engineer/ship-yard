/**
 * LP 公開トグル(ADR-009 Day 33)の状態型・初期値。
 *
 * `'use server'` ファイル(`_actions/toggle-publish.ts`)は async 関数しか export できないため、
 * 型と定数はこの通常モジュールに分離する(生成アクションの `generate-lp-form.ts` と同じ構成)。
 */

/** LP 公開トグル Server Action の戻り値。成功時は `revalidatePath` でページが再描画される。 */
export interface TogglePublishState {
  ok: boolean;
  error?: string;
}

export const INITIAL_TOGGLE_PUBLISH_STATE: TogglePublishState = { ok: false };
