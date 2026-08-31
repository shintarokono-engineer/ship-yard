'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { AiJobView } from '@/lib/api/types';

/**
 * 実行中ジョブがあるときに一覧を再取得する間隔(ms)。
 *
 * `router.refresh()` は**ページ全体**を再取得するため、この一覧では workspace / project /
 * 履歴 / ジョブ / usage の 5 本が毎回走る。診断は約 90 秒かかるので、5 秒間隔だと 1 回あたり
 * 約 90 本の API 呼び出しになり、App Runner 0.5 vCPU では無視できない。10 秒に落として半減させた。
 *
 * ジョブだけを client fetch で取りに行けば軽くできるが、`API_URL` は
 * `NEXT_PUBLIC_` を付けない設計(ブラウザから API を直接叩かせない、implementation-rules.md)
 * のため、Route Handler を挟まない限りクライアントからは呼べない。割に合わないので間隔調整に留める。
 */
const POLL_INTERVAL_MS = 10000;

/** 経過時間の表示を更新する間隔(ms)。 */
const TICK_INTERVAL_MS = 1000;

/**
 * 履歴一覧の先頭に出す「実行中」「直近の失敗」 行(ADR-016、プロダクト診断 / アイデア検証 共通)。
 *
 * これらの機能は 88〜113 秒かかり Vercel Hobby の関数実行上限(60 秒)を超えるため、実行は
 * 投げっぱなしにして結果は後から取得する。ユーザーが実行後にページを離れても、戻れば
 * ここで進行が分かる。
 *
 * 完了した行は出さない(BE の `listActive` が DONE を返さない)。完了すると結果本体が
 * 履歴一覧に現れるので、実行中行は「結果行に置き換わった」 ように見える。
 *
 * 実行中がある間だけ `router.refresh()` でサーバー再取得する。ポーリングを止める条件を
 * ジョブの有無に紐付けているので、完了後にタイマーが回り続けることはない。
 */
export function AiJobRows({ jobs, runningLabel }: { jobs: AiJobView[]; runningLabel: string }) {
  const router = useRouter();
  const hasRunning = jobs.some((j) => j.status === 'RUNNING');

  /**
   * 現在時刻。**マウントするまで `null` のままにする。**
   *
   * `useState(() => Date.now())` にすると初期化関数が SSR 時にサーバーでも走り、サーバーが
   * 描画した秒数とクライアントがハイドレート時に計算する秒数がズレて hydration mismatch になる
   * (実際に踏んだ)。時刻依存の表示はサーバーとクライアントで一致しないので、初回描画では
   * 出さずに `useEffect`(クライアントでしか動かない)で埋める。
   */
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!hasRunning) return;
    setNow(Date.now());
    const poll = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    const tick = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [hasRunning, router]);

  if (jobs.length === 0) return null;

  return (
    <ul className="space-y-2">
      {jobs.map((job) =>
        job.status === 'RUNNING' ? (
          <li
            key={job.id}
            className="border-primary/30 bg-primary/5 flex items-center gap-3 rounded-lg border px-4 py-3"
          >
            <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden="true" />
            <div className="min-w-0">
              {/* 読み上げるのは状態の変化だけ。経過秒数を含めると毎秒読み上げられてしまう。 */}
              <p className="text-sm font-medium" aria-live="polite">
                {runningLabel}
              </p>
              <p className="text-muted-foreground text-xs" aria-hidden="true">
                90 秒ほどかかります
                {now !== null && `(経過 ${elapsedSeconds(job.createdAt, now)} 秒)`}
                。このページを離れても実行は続きます。
              </p>
            </div>
          </li>
        ) : (
          <li
            key={job.id}
            className="border-destructive/30 bg-destructive/5 flex items-start gap-3 rounded-lg border px-4 py-3"
          >
            <AlertCircle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium">実行に失敗しました</p>
              <p className="text-muted-foreground text-xs">
                {job.errorMessage ?? '時間をおいて再実行してください。'}
                {' 上の実行ボタンからやり直せます。'}
              </p>
            </div>
          </li>
        ),
      )}
    </ul>
  );
}

/** 開始からの経過秒数。負値(サーバーとの時刻ずれ)は 0 に丸める。 */
function elapsedSeconds(createdAt: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
}
