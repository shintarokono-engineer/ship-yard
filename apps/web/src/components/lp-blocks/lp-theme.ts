import type { LpTheme } from '@/lib/api/types';

/**
 * LP カラーテーマ(ADR-009 Phase 5a)。テーマはページ全体のアクセント色を切り替える。
 * hero / セクション背景の色味・見出しの色・差し色をまとめて同系色にし、レイアウトは変えない。
 *
 * クラス文字列は Tailwind がソース走査で検出できるよう、すべてリテラルで列挙する
 * (動的な文字列連結で色名を組み立てると検出されず効かない)。
 */

/** 1 テーマぶんのアクセント配色クラス(パレット)。 */
export interface LpThemeClasses {
  /** hero セクションの背景(同系色のグラデーション)。 */
  heroBg: string;
  /** features / testimonial セクションの背景(淡い同系色)。 */
  sectionBg: string;
  /** 見出し・stats 数値などのアクセントテキスト色。 */
  accentText: string;
  /** CTA セクション背景 / hero の CTA ボタン背景(濃色 + その上の文字色)。 */
  accentSolid: string;
  /** 濃色要素のホバー。 */
  accentSolidHover: string;
  /** feature / testimonial アイコンの淡い色掛け。 */
  accentSoft: string;
}

/** テーマごとの表示メタ(編集 UI のラベル・スウォッチ)と配色クラス。 */
export const LP_THEME_META: Record<
  LpTheme,
  { label: string; swatch: string; classes: LpThemeClasses }
> = {
  default: {
    label: 'デフォルト',
    swatch: 'bg-zinc-900',
    classes: {
      // アプリの --primary は indigo。LP の default はそれと独立にニュートラルを
      // 保ちたいため、差し色は token ではなく zinc リテラルに固定する。
      heroBg: 'bg-background',
      sectionBg: 'bg-muted/30',
      accentText: 'text-foreground',
      accentSolid: 'bg-zinc-900 text-white',
      accentSolidHover: 'hover:bg-zinc-800',
      accentSoft: 'bg-zinc-100 text-zinc-900',
    },
  },
  blue: {
    label: 'ブルー',
    swatch: 'bg-blue-600',
    classes: {
      heroBg: 'bg-linear-to-b from-blue-50 to-background dark:from-blue-950/40',
      sectionBg: 'bg-blue-50/50 dark:bg-blue-950/20',
      accentText: 'text-blue-700 dark:text-blue-400',
      accentSolid: 'bg-blue-600 text-white',
      accentSolidHover: 'hover:bg-blue-700',
      accentSoft: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    },
  },
  emerald: {
    label: 'エメラルド',
    swatch: 'bg-emerald-600',
    classes: {
      heroBg: 'bg-linear-to-b from-emerald-50 to-background dark:from-emerald-950/40',
      sectionBg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
      accentText: 'text-emerald-700 dark:text-emerald-400',
      accentSolid: 'bg-emerald-600 text-white',
      accentSolidHover: 'hover:bg-emerald-700',
      accentSoft: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    },
  },
  violet: {
    label: 'バイオレット',
    swatch: 'bg-violet-600',
    classes: {
      heroBg: 'bg-linear-to-b from-violet-50 to-background dark:from-violet-950/40',
      sectionBg: 'bg-violet-50/50 dark:bg-violet-950/20',
      accentText: 'text-violet-700 dark:text-violet-400',
      accentSolid: 'bg-violet-600 text-white',
      accentSolidHover: 'hover:bg-violet-700',
      accentSoft: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    },
  },
  rose: {
    label: 'ローズ',
    swatch: 'bg-rose-600',
    classes: {
      heroBg: 'bg-linear-to-b from-rose-50 to-background dark:from-rose-950/40',
      sectionBg: 'bg-rose-50/50 dark:bg-rose-950/20',
      accentText: 'text-rose-700 dark:text-rose-400',
      accentSolid: 'bg-rose-600 text-white',
      accentSolidHover: 'hover:bg-rose-700',
      accentSoft: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    },
  },
  amber: {
    label: 'アンバー',
    swatch: 'bg-amber-500',
    classes: {
      heroBg: 'bg-linear-to-b from-amber-50 to-background dark:from-amber-950/40',
      sectionBg: 'bg-amber-50/50 dark:bg-amber-950/20',
      accentText: 'text-amber-700 dark:text-amber-400',
      // amber は明るいため濃色の上は白ではなく濃いテキストにする(コントラスト確保)。
      accentSolid: 'bg-amber-500 text-amber-950',
      accentSolidHover: 'hover:bg-amber-400',
      accentSoft: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    },
  },
};

/**
 * テーマ文字列から配色クラスを取得する。`blocks` / `theme` は JSON 由来で実行時は文字列のため、
 * 未知値が来たら `default` にフォールバックする(防御的)。
 */
export function getLpThemeClasses(theme: string): LpThemeClasses {
  return (LP_THEME_META[theme as LpTheme] ?? LP_THEME_META.default).classes;
}
