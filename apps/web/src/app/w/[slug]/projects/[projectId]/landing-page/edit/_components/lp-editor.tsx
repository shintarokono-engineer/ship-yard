'use client';

import Link from 'next/link';
import { useActionState, useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { LpBlock } from '@/lib/api/types';

import { updateLandingPageAction } from '../../_actions/update-landing-page';
import { INITIAL_UPDATE_LP_STATE, isLpBlockValid, type UpdateLpState } from '../../_shared/lp-edit';
import { BlockCardEditor } from './block-card-editor';

/**
 * LP ブロック編集 UI(ADR-009、Day 32)。各ブロックのテキストフィールドを編集し、まとめて保存する。
 *
 * ブロック配列を controlled state で保持し、保存時に `useActionState` 経由で Server Action へ渡す。
 * 必須項目が未入力のブロックがあると保存ボタンを無効化する(API 側 `parseLpBlocks` での黙殺を防ぐ)。
 * ブロックの追加 / 削除 / 並び替えは v2。
 */
export function LpEditor({
  slug,
  projectId,
  initialBlocks,
}: {
  slug: string;
  projectId: string;
  initialBlocks: LpBlock[];
}) {
  const [blocks, setBlocks] = useState<LpBlock[]>(initialBlocks);
  const boundAction = useMemo(
    () => updateLandingPageAction.bind(null, slug, projectId),
    [slug, projectId],
  );
  const [state, save, pending] = useActionState<UpdateLpState, LpBlock[]>(
    boundAction,
    INITIAL_UPDATE_LP_STATE,
  );

  // 安定参照の更新関数。これを全 `BlockCardEditor`(memo 化済み)へ渡すことで、1 フィールドの
  // 打鍵で再描画されるのは対象ブロックのカードだけになる(他カードは props 不変で skip)。
  const updateBlock = useCallback(
    (index: number, next: LpBlock) =>
      setBlocks((prev) => prev.map((b, k) => (k === index ? next : b))),
    [],
  );

  const allValid = blocks.every(isLpBlockValid);
  const previewHref = `/w/${slug}/projects/${projectId}/landing-page`;

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {blocks.map((block, i) => (
          <BlockCardEditor
            key={`${block.type}-${i}`}
            block={block}
            index={i}
            disabled={pending}
            onChange={updateBlock}
          />
        ))}
      </div>

      {state.formError && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {state.formError}
        </p>
      )}
      {!allValid && (
        <p className="text-muted-foreground text-sm">
          必須項目(<span className="text-destructive">*</span>)が未入力のブロックがあります。
          すべて入力すると保存できます。
        </p>
      )}

      <div className="bg-background/95 sticky bottom-0 flex justify-end gap-2 border-t py-3 backdrop-blur">
        <Button variant="ghost" asChild>
          <Link href={previewHref}>キャンセル</Link>
        </Button>
        <Button onClick={() => save(blocks)} disabled={pending || !allValid} aria-busy={pending}>
          {pending ? '保存中...' : '保存する'}
        </Button>
      </div>
    </div>
  );
}
