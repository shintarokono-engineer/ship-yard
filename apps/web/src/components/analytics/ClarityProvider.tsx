'use client';

import { useEffect } from 'react';
import Clarity from '@microsoft/clarity';

/**
 * Microsoft Clarity(ヒートマップ / セッションリプレイ)の初期化。描画は行わない。
 * 環境判定は持たず、`app/layout.tsx` が本番かつ ID 設定済みのときだけこれを描画する。
 *
 * `init` は `<script>` を注入する副作用なのでプロセス内で一度だけ呼ぶ。StrictMode の
 * 二重実行を防ぐのに `useRef` ではなくモジュールスコープのフラグを使うのは、ref だと
 * 「アンマウント → 再マウント」でも再度 init されてしまうため。
 */
let initialized = false;

export function ClarityProvider({ projectId }: { projectId: string }) {
  useEffect(() => {
    if (initialized) return;
    initialized = true;

    try {
      Clarity.init(projectId);
    } catch {
      // スクリプト注入の失敗(ブロッカー / ネットワーク断)でアプリを止めない
    }
  }, [projectId]);

  return null;
}
