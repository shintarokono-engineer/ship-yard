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
 * プロジェクト詳細ヘッダーの操作群。編集を主アクション、削除はオーバーフローメニューに置く。
 *
 * 開閉 state をここで持つのは削除ダイアログだけ(メニュー項目から開くため外部制御が要る)。
 * 編集 Sheet はトリガーと state を内包する(理由は `EditProjectSheet` のコメント)。
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

  // `onCloseAutoFocus` を止めているため Radix の自動復帰が効かない。
  // 戻し先を持たないとダイアログを閉じたときフォーカスが <body> に落ちる。
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
          {/* 止めないと、開いた直後の AlertDialog からフォーカスがトリガーへ引き戻される。 */}
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
