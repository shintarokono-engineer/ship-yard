'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import { runCheckAction } from '../_actions/run-check';
import {
  IDEA_TEXT_MAX_LENGTH,
  INITIAL_CHECK_FORM_STATE,
  parseCheckFormData,
  type CheckFormState,
} from '../_shared/check-form';

const PLACEHOLDER = `例)資格試験を独学する社会人向けの、解いた過去問の記録から弱い分野を割り出す学習アプリ。
仕事の合間に少しずつ解くので、どの分野をどれだけ間違えたかを把握できず、同じ範囲ばかり復習してしまう。
解いた問題と正誤を記録すると、分野ごとの正答率を出し、次に解くべき問題を自動で選んでくれる。`;

/**
 * `/check` の入力フォーム(ADR-015)。テキストエリア 1 つと実行ボタンだけ。
 *
 * 診断は同期実行で 15〜22 秒かかるため、待っている間に何が起きているかを出す。
 */
export function CheckForm() {
  const [state, formAction, pending] = useActionState<CheckFormState, FormData>(
    runCheckAction,
    INITIAL_CHECK_FORM_STATE,
  );

  const [ideaText, setIdeaText] = useState(state.ideaText ?? '');
  // クライアント側の事前検証。空送信をサーバー往復なしで弾き、ボタン文言のちらつきを防ぐ。
  const [clientError, setClientError] = useState<string | null>(null);
  const displayFieldError = clientError ?? state.fieldError;
  const overLimit = ideaText.length > IDEA_TEXT_MAX_LENGTH;

  function handleSubmit(formData: FormData) {
    const parsed = parseCheckFormData(formData);
    if (parsed.error) {
      setClientError(parsed.error);
      return;
    }
    setClientError(null);
    formAction(formData);
  }

  return (
    <form action={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="ideaText" className="sr-only">
          アプリのアイデア
        </label>
        <Textarea
          id="ideaText"
          name="ideaText"
          rows={6}
          value={ideaText}
          onChange={(e) => setIdeaText(e.target.value)}
          placeholder={PLACEHOLDER}
          disabled={pending}
          aria-invalid={displayFieldError ? true : undefined}
          aria-describedby={displayFieldError ? 'ideaText-error' : undefined}
          className="min-h-40 resize-y text-base leading-7"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            誰の・どんな課題を・どう解決するかが書かれているほど精度が上がります。
          </p>
          <span
            className={`shrink-0 text-xs tabular-nums ${overLimit ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {ideaText.length} / {IDEA_TEXT_MAX_LENGTH}
          </span>
        </div>
        {displayFieldError && (
          <p id="ideaText-error" role="alert" className="text-destructive text-sm">
            {displayFieldError}
          </p>
        )}
      </div>

      {state.formError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>診断を実行できませんでした</AlertTitle>
          <AlertDescription className="gap-3">
            <p>{state.formError}</p>
            {/* 上限到達は行き止まりにせず、登録への導線を出す。 */}
            {state.limitReached && (
              <Button asChild size="sm">
                <Link href="/sign-up">アカウントを作成して続ける</Link>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="lg" disabled={pending || overLimit} className="w-full text-base">
        {pending ? (
          <Spinner aria-hidden="true" />
        ) : (
          <Sparkles className="size-4" aria-hidden="true" />
        )}
        {pending ? 'アイデアを読んでいます…' : '無料で診断する'}
      </Button>

      {pending ? (
        <p role="status" className="text-muted-foreground text-center text-xs">
          20 秒ほどかかります。このページを開いたままお待ちください。
        </p>
      ) : (
        <p className="text-muted-foreground text-center text-xs">
          ログイン不要・無料。入力したアイデアが公開されることはありません。
        </p>
      )}
    </form>
  );
}
