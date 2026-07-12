'use client';

import Link from 'next/link';
import { useActionState, useCallback, useMemo, useState } from 'react';

import { LpRenderer } from '@/components/lp-blocks/lp-renderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LpBlock, LpTheme } from '@/lib/api/types';

import { updateLandingPageAction } from '../../_actions/update-landing-page';
import { INITIAL_UPDATE_LP_STATE, isLpBlockValid, type UpdateLpState } from '../../_shared/lp-edit';
import { BlockCardEditor } from './block-card-editor';
import { ThemePicker } from './theme-picker';

/** `useActionState` 経由で Server Action へ渡す編集後の LP 内容。 */
type UpdateLpPayload = { blocks: LpBlock[]; theme: LpTheme };

/**
 * LP ブロック編集 UI(ADR-009、Day 32 / Phase 5a)。各ブロックのテキストとカラーテーマを編集し、
 * まとめて保存する。編集パネルの隣にライブプレビューを並べ、テキスト / 色の変更を即座に反映する。
 *
 * ブロック配列とテーマを controlled state で保持し、保存時に `useActionState` 経由で Server Action
 * へ渡す。プレビューは同じ state を純コンポーネント `LpRenderer` に流すだけで実現する。
 * 必須項目が未入力のブロックがあると保存ボタンを無効化する(API 側 `parseLpBlocks` での黙殺を防ぐ)。
 * ブロックの追加 / 削除 / 並び替えは v2。
 */
export function LpEditor({
  slug,
  projectId,
  initialBlocks,
  initialTheme,
}: {
  slug: string;
  projectId: string;
  initialBlocks: LpBlock[];
  initialTheme: LpTheme;
}) {
  const [blocks, setBlocks] = useState<LpBlock[]>(initialBlocks);
  const [theme, setTheme] = useState<LpTheme>(initialTheme);
  const boundAction = useMemo(
    () => updateLandingPageAction.bind(null, slug, projectId),
    [slug, projectId],
  );
  const [state, save, pending] = useActionState<UpdateLpState, UpdateLpPayload>(
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
    <div className="grid gap-6 xl:grid-cols-2">
      {/* 編集パネル */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">カラーテーマ</CardTitle>
          </CardHeader>
          <CardContent>
            <ThemePicker theme={theme} onChange={setTheme} disabled={pending} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {blocks.map((block, i) => (
            // 編集 UI では key を編集対象フィールドから合成してはいけない(打鍵ごとに key が変わり
            // カードが remount → 入力欄からフォーカスが外れる)。v1 は追加/削除/並び替えが無く配列の
            // 位置が安定なので、type + index の安定 key を使う。getLpBlockKey は読み取り専用の
            // LpRenderer 専用に留める。
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
          <Button
            onClick={() => save({ blocks, theme })}
            disabled={pending || !allValid}
            aria-busy={pending}
          >
            {pending ? '保存中...' : '保存する'}
          </Button>
        </div>
      </div>

      {/* ライブプレビュー(編集中の blocks / theme をそのまま描画) */}
      <div className="xl:sticky xl:top-6">
        <p className="text-muted-foreground mb-2 text-sm font-medium">プレビュー</p>
        <div className="overflow-hidden rounded-xl border shadow-sm">
          <div className="bg-muted flex items-center gap-1.5 border-b px-3 py-2" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-red-400/70" />
            <span className="size-2.5 rounded-full bg-amber-400/70" />
            <span className="size-2.5 rounded-full bg-emerald-400/70" />
          </div>
          <div className="max-h-[75vh] overflow-y-auto">
            <LpRenderer blocks={blocks} theme={theme} headingLevel={2} />
          </div>
        </div>
      </div>
    </div>
  );
}
