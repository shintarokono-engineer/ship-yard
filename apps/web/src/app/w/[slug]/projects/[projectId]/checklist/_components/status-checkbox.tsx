'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/**
 * status を TODO ↔ DONE でトグルする軽量チェックボックス(表示のみ)。
 *
 * 状態と Server Action の呼び出しは親の `ChecklistItemRow` が持つ。
 * チェック状態と取消線を同じ楽観値から描くため、ここでは状態を持たない。
 *
 * 既定の `bg-primary`(violet)ではなく emerald に寄せているのは、「完了」 の色として
 * ブランドアクセントより緑のほうが直感的なため(素の `<input>` 時代の `accent-emerald-600` を踏襲)。
 */
export function StatusCheckbox({
  checked,
  onToggle,
  disabled,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={onToggle}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'shrink-0 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 dark:data-[state=checked]:bg-emerald-600',
        !disabled && 'cursor-pointer',
      )}
    />
  );
}
