'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useOptimistic, useRef } from 'react';

import { CreditCostBadge } from '@/components/credit-cost-badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { MonthlyUsageSummary, RagQaMessage } from '@/lib/api/types';

import { askMessageAction, type AskMessageFormState } from '../../_actions/ask-message';
import {
  INITIAL_ASK_MESSAGE_FORM_STATE,
  QUESTION_MAX_LENGTH,
} from '../../_shared/ask-message-form';
import { RagQaMessageItem } from './rag-qa-message-item';

/** 楽観表示中のメッセージは `pending` フラグを持ちうる(実データには無い)。 */
type DisplayMessage = RagQaMessage & { pending?: boolean };

/**
 * RAG_QA チャットパネル('use client')。
 *
 * 送信は Server Action(`askMessageAction`)。`useOptimistic` で送信した質問と
 * 「生成中」プレースホルダを即座に表示し、Server Action 完了 → `revalidatePath` で
 * 確定したメッセージ履歴(`initialMessages` の更新)に置き換わる。
 *
 * 閲覧専用ロール(REVIEWER / TESTER / VIEWER)では入力欄を出さない(API 側でも 403)。
 */
export function RagQaChatPanel({
  slug,
  projectId,
  sessionId,
  initialMessages,
  canWrite,
  usage,
}: {
  slug: string;
  projectId: string;
  sessionId: string;
  initialMessages: RagQaMessage[];
  canWrite: boolean;
  usage: MonthlyUsageSummary;
}) {
  const boundAction = useMemo(
    () => askMessageAction.bind(null, slug, projectId, sessionId),
    [slug, projectId, sessionId],
  );
  const [state, formAction, pending] = useActionState<AskMessageFormState, FormData>(
    boundAction,
    INITIAL_ASK_MESSAGE_FORM_STATE,
  );

  const [optimisticMessages, addOptimistic] = useOptimistic<DisplayMessage[], string>(
    initialMessages,
    (current, question) => [
      ...current,
      {
        id: '__optimistic_user__',
        sessionId,
        role: 'USER',
        content: question,
        tokensIn: null,
        tokensOut: null,
        references: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: '__optimistic_assistant__',
        sessionId,
        role: 'ASSISTANT',
        content: '',
        tokensIn: null,
        tokensOut: null,
        references: null,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ],
  );

  const formRef = useRef<HTMLFormElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // 直近に送信した質問。送信が失敗したとき textarea へ復元するために保持する。
  const lastQuestionRef = useRef('');

  // メッセージが増えるたびに最下部へスクロール。
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [optimisticMessages]);

  // 送信失敗時は楽観メッセージが破棄され textarea も reset 済みなので、入力を復元してやり直しやすくする。
  useEffect(() => {
    if (state.ok || !state.formError || !lastQuestionRef.current) return;
    const field = formRef.current?.elements.namedItem('question');
    if (field instanceof HTMLTextAreaElement) {
      field.value = lastQuestionRef.current;
    }
  }, [state]);

  /** 楽観メッセージを積んでから Server Action を呼ぶ。`<form action>` 経由なので transition 内で実行される。 */
  function handleAction(formData: FormData): void {
    const question = String(formData.get('question') ?? '').trim();
    if (!question) return;
    lastQuestionRef.current = question;
    addOptimistic(question);
    formRef.current?.reset();
    formAction(formData);
  }

  const hasMessages = optimisticMessages.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {hasMessages ? (
          optimisticMessages.map((message) => (
            <RagQaMessageItem key={message.id} message={message} pending={message.pending} />
          ))
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
            まだメッセージがありません。下の入力欄からプロジェクトについて質問してみましょう。
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {canWrite ? (
        <form
          ref={formRef}
          action={handleAction}
          className="bg-background sticky bottom-0 space-y-2 border-t pt-3"
        >
          <Textarea
            name="question"
            rows={3}
            required
            aria-label="AI への質問"
            maxLength={QUESTION_MAX_LENGTH}
            placeholder="例: このプロジェクトの最初のマイルストーンはどう切るべき?"
            disabled={pending}
          />

          {state.formError && !state.quotaExceeded && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {state.formError}
            </p>
          )}

          {state.quotaExceeded && (
            <div
              role="alert"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
            >
              <p>{state.formError}</p>
              <Link
                href={`/w/${slug}`}
                className="mt-1 inline-block text-xs underline underline-offset-2"
              >
                プランのアップグレードについて(準備中)
              </Link>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CreditCostBadge feature="RAG_QA" usage={usage} />
              <p aria-live="polite" className="text-muted-foreground text-xs">
                {pending ? 'AI が回答を生成しています…' : ' '}
              </p>
            </div>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? '生成中...' : '送信'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground border-t pt-3 text-sm">
          このセッションは閲覧専用です。質問の送信には書き込み権限(開発者以上)が必要です。
        </p>
      )}
    </div>
  );
}
