import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

/**
 * Markdown を HTML として描画するビューア。
 *
 * - remark-gfm で GFM(テーブル / strikethrough / タスクリスト / autolinks)対応
 * - 任意 HTML は描画しない(react-markdown のデフォルト挙動、XSS 防止)
 * - 子孫セレクタ(`[&_h1]:...` 等)でラッパー側に Tailwind スタイルを当てる。`@tailwindcss/typography` 未導入のためベタ書き
 *
 * ProjectDocument の本文表示(documents)と RAG_QA の AI 回答表示(rag-qa)で共有するため、
 * ルート専用の `_components` ではなく `src/components/` 直下に置く。
 */
export function MarkdownViewer({ source, className }: { source: string; className?: string }) {
  return (
    <div
      className={cn(
        'text-foreground/90 text-sm leading-7',
        '[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold',
        '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold',
        '[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold',
        '[&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:font-semibold',
        '[&_p]:my-3',
        '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6',
        '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6',
        '[&_li]:my-1',
        '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:no-underline',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs',
        '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-4',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-sm',
        '[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
        '[&_hr]:my-6 [&_hr]:border-border',
        '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
        '[&_th]:border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium',
        '[&_td]:border [&_td]:px-3 [&_td]:py-2',
        '[&_img]:my-4 [&_img]:max-w-full [&_img]:rounded',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
