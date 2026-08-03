'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const OPTIONS = [
  { value: 'light', label: 'ライト', icon: Sun },
  { value: 'dark', label: 'ダーク', icon: Moon },
  { value: 'system', label: 'システム', icon: Monitor },
] as const;

/**
 * ライト / ダーク / システム の切替(ヘッダー用)。
 *
 * サーバー側では OS の設定が分からないため、マウント前は「システム」のアイコンを出す。
 * `resolvedTheme` を初期表示に使うと hydration mismatch になる。
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const Icon = !mounted ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="テーマを切り替える"
        className="hover:bg-accent focus-visible:ring-ring/50 flex cursor-pointer items-center rounded-md p-1.5 transition-colors outline-none focus-visible:ring-[3px]"
      >
        <Icon className="text-muted-foreground size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {/* RadioGroup にすることで選択状態が aria-checked で読み上げられる
            (色だけの表現だとスクリーンリーダーに伝わらない)。 */}
        <DropdownMenuRadioGroup
          value={mounted ? theme : undefined}
          onValueChange={(next) => setTheme(next)}
        >
          {OPTIONS.map((opt) => (
            <DropdownMenuRadioItem key={opt.value} value={opt.value}>
              <opt.icon className="size-4" aria-hidden="true" />
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
