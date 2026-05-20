import { Sparkles } from 'lucide-react';

import { MarkdownViewer } from '@/components/markdown-viewer';
import { Badge } from '@/components/ui/badge';
import { DOC_TYPE_META, type RagQaMessage } from '@/lib/api/types';

/**
 * RAG_QA チャットのメッセージ 1 件。
 *
 * - USER: 右寄せ・プレーンテキスト(`whitespace-pre-wrap`)
 * - ASSISTANT: 左寄せ・Markdown 描画。参照ドキュメント(`references`)があれば回答の下に一覧表示
 * - `pending`(楽観表示の AI プレースホルダ): 生成中メッセージを出す
 */
export function RagQaMessageItem({
  message,
  pending,
}: {
  message: RagQaMessage;
  pending?: boolean;
}) {
  if (message.role === 'USER') {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground max-w-[85%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap">
          <span className="sr-only">あなたの質問: </span>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="bg-muted/40 max-w-[85%] space-y-3 rounded-lg border px-4 py-3">
        {pending ? (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            AI が回答を生成しています。完了まで 5〜15 秒ほどかかります…
          </p>
        ) : (
          <>
            <span className="sr-only">AI の回答: </span>
            <MarkdownViewer source={message.content} />
            {message.references && message.references.length > 0 && (
              <div className="space-y-1.5 border-t pt-2.5">
                <p className="text-muted-foreground text-xs font-medium">参照したドキュメント</p>
                <ul className="space-y-1">
                  {message.references.map((ref) => (
                    <li
                      key={ref.id}
                      className="text-muted-foreground flex items-center gap-1.5 text-xs"
                    >
                      <span className="bg-muted shrink-0 rounded px-1.5 py-0.5">
                        {DOC_TYPE_META[ref.type].label}
                      </span>
                      <span className="truncate">{ref.title}</span>
                      {ref.isSeed && (
                        <Badge
                          variant="outline"
                          className="shrink-0 gap-0.5 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        >
                          <Sparkles className="size-3" aria-hidden="true" />
                          運営サンプル
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
