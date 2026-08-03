'use client';

import { cn } from '@/lib/utils';

/**
 * status を TODO ↔ DONE でトグルする軽量チェックボックス(表示のみ)。
 *
 * 状態と Server Action の呼び出しは親の `ChecklistItemRow` が持つ。
 * チェック状態と取消線を同じ楽観値から描くため、ここでは状態を持たない。
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
    <input
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      disabled={disabled}
      aria-label={label}
      className={cn('size-4 shrink-0 accent-emerald-600', !disabled && 'cursor-pointer')}
    />
  );
}
