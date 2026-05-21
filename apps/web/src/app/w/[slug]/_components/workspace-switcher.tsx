'use client';

import Link from 'next/link';
import { Check, ChevronsUpDown, Plus, Rocket, Settings } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { MyWorkspaceListItem, Workspace } from '@/lib/api/types';
import { cn } from '@/lib/utils';

/**
 * ヘッダー左上のワークスペーススイッチャー(案 A、Linear / Slack 流)。
 *
 * 1 コンポーネントで「WS 切替」「WS 設定への導線」「WS 作成」を集約する。
 * アカウント単位の操作(プロフィール / サインアウト)は右上の Clerk UserButton に分離。
 */
export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: Pick<Workspace, 'slug' | 'name' | 'plan'>;
  workspaces: MyWorkspaceListItem[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <Rocket className="size-4" />
        <span className="max-w-[12rem] truncate">{current.name}</span>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {current.plan}
        </Badge>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>ワークスペース</DropdownMenuLabel>
        <DropdownMenuGroup>
          {workspaces.map((ws) => (
            <DropdownMenuItem key={ws.id} asChild>
              <Link href={`/w/${ws.slug}`}>
                <Check
                  className={cn(
                    'size-4',
                    ws.slug === current.slug ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{ws.name}</span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {ws.plan}
                </Badge>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/w/${current.slug}/settings`}>
            <Settings className="size-4" aria-hidden="true" />
            ワークスペース設定
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus className="size-4" aria-hidden="true" />
            ワークスペースを作成
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
