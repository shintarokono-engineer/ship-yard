'use client';

import { useRef, useState } from 'react';
import { MoreHorizontal, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Project } from '@/lib/api/types';

import { DeleteProjectDialog } from './delete-project-dialog';
import { EditProjectSheet } from './edit-project-sheet';

/**
 * プロジェクト詳細ヘッダーの操作群。
 *
 * 以前は `[編集][削除]` を並べており、ページ内で最も彩度の高い要素(赤の塗り)が
 * 破壊的操作になっていた。編集を主アクション、削除をオーバーフローメニューに退避し、
 * 視覚的な重みを実際の使用頻度に合わせている。
 *
 * 開閉 state をここで持つのは削除ダイアログだけ。メニュー項目から開くため外部制御が要る。
 * 編集 Sheet は自前のトリガーと state を内包する(成功時のクローズを render 中に行うので、
 * 開閉を親に持たせると別コンポーネントの render 中更新になってしまう)。
 */
export function ProjectActions({
  slug,
  project,
  canWrite,
  canDelete,
}: {
  slug: string;
  project: Project;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ダイアログを閉じたあとのフォーカス戻し先。`onCloseAutoFocus` を止めている都合で
  // Radix の自動復帰が効かず、放っておくとキーボード利用者が `<body>` に落ちる
  // (メニュー項目は AlertDialog が開いた時点で unmount 済みなので復帰先にならない)。
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  if (!canWrite && !canDelete) return null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {canWrite && <EditProjectSheet slug={slug} project={project} />}

      {canDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button ref={menuTriggerRef} variant="ghost" size="icon" aria-label="その他の操作">
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          {/*
            メニューを閉じるときの自動フォーカス復帰を止める。
            止めないと、開いた直後の AlertDialog からフォーカスがトリガーへ引き戻される。
          */}
          <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 aria-hidden="true" className="text-destructive" />
              削除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {canDelete && (
        <DeleteProjectDialog
          slug={slug}
          project={project}
          open={deleteOpen}
          onOpenChange={(next) => {
            setDeleteOpen(next);
            if (!next) menuTriggerRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
