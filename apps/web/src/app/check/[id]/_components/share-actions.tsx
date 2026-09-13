'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Check, Link2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';

import { enableSharingAction } from '../_actions/share-check';

/** X のロゴ。lucide には無いため SVG を直接持つ。 */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * 結果の共有(opt-in、ADR-015)。押すまで `sharedAt` は立たない。
 *
 * 共有しても `noindex` は維持される。共有済みは purge の対象外になる。
 * X の導線は新規タブを開いた直後に元タブを閉じられると `sharedAt` が立たないが、
 * 発生確率とサーバー経由にする複雑さを比べて許容している。
 */
export function ShareActions({
  id,
  url,
  score,
  initiallyShared,
}: {
  id: string;
  /** 結果ページの絶対 URL。X の投稿に載せるためサーバー側で組み立てて渡す。 */
  url: string;
  score: number;
  initiallyShared: boolean;
}) {
  const [shared, setShared] = useState(initiallyShared);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const shareText = `アイデアを AI に採点してもらったら ${score}/100 でした。`;
  const xHref = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;

  function enableSharing() {
    if (shared) return;
    startTransition(async () => {
      await enableSharingAction(id);
      setShared(true);
    });
  }

  function handleCopy() {
    // クリップボードへの書き込みは**ユーザー操作の直後**に行う(await を挟むと拒否されうる)。
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // クリップボードが使えない環境(権限拒否 / http)。共有自体は成立させる。
      });
    enableSharing();
  }

  return (
    <div className="space-y-2">
      <ButtonGroup>
        <Button asChild variant="outline" onClick={enableSharing}>
          <a href={xHref} target="_blank" rel="noopener noreferrer">
            <XIcon className="size-4" />X で共有
          </a>
        </Button>
        <Button variant="outline" onClick={handleCopy} disabled={pending}>
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Link2 className="size-4" aria-hidden="true" />
          )}
          {copied ? 'コピーしました' : 'リンクをコピー'}
        </Button>
      </ButtonGroup>
      <p className="text-muted-foreground text-xs leading-5">
        共有すると、
        <strong className="text-foreground font-medium">
          スコア・改善提案・入力したアイデア文
        </strong>
        を URL を知る人が見られるようになります。検索結果には表示されません。
      </p>
    </div>
  );
}
