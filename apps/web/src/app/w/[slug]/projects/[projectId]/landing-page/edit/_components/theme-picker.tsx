import { Check } from 'lucide-react';

import { LP_THEME_META } from '@/components/lp-blocks/lp-theme';
import { LP_THEMES, type LpTheme } from '@/lib/api/types';
import { cn } from '@/lib/utils';

/**
 * LP カラーテーマの選択(ADR-009 Phase 5a)。プリセットをスウォッチ付きボタンで並べる。
 */
export function ThemePicker({
  theme,
  onChange,
  disabled,
}: {
  theme: LpTheme;
  onChange: (theme: LpTheme) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {LP_THEMES.map((t) => {
        const meta = LP_THEME_META[t];
        const selected = t === theme;
        return (
          <button
            key={t}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onChange(t)}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
              selected
                ? 'border-foreground font-medium'
                : 'border-input hover:bg-accent disabled:opacity-50',
            )}
          >
            <span className={cn('size-4 rounded-full', meta.swatch)} aria-hidden="true" />
            {meta.label}
            {selected && <Check className="size-3.5" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
