import { Category } from '@shipyard/db';

/**
 * `ChecklistItem` の配列を Tool Use で受け取るための共通スキーマと検証(ADR-005)。
 *
 * CHECKLIST_GEN(プロジェクト情報から一括生成)と F17(改善提案をタスクへ分解)は、
 * 目的もプロンプトも違うが **受け取る構造は同一**(`{ category, title, description? }[]`)。
 * 検証を各 Service に複製すると `Category` enum の防御が片方だけ古くなる事故が起きるため、
 * ここに 1 本化する。
 *
 * リポジトリの慣行に合わせて純粋関数として export している(Service の private static のままだと
 * Vitest から呼べない)。先例は `announcements/announcement-tool.ts`。
 */

/**
 * Tool 入力スキーマで受け取る `category` の文字列値(= Category enum のキー)。
 * 利用側にキャストを配らないよう、ここで型を確定させる。
 */
export const CATEGORY_VALUES: Category[] = Object.values(Category);

/** 1 件の生成済みチェックリスト項目(DB 保存前の中間表現)。 */
export interface GeneratedChecklistItem {
  category: Category;
  title: string;
  /** 任意。AI が必要と判断したら埋める。 */
  description?: string;
}

/** 生成結果 + AIUsage 記録用のトークン数。CHECKLIST_GEN と F17 の両方が返す。 */
export interface GeneratedChecklist {
  items: GeneratedChecklistItem[];
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/** `buildChecklistItemsTool` の引数。Feature 間で変わるのはこの 4 つだけ。 */
export interface ChecklistItemsToolOptions {
  /** Tool 名。`tool_choice` と `extractToolUseBlock` の突き合わせに使う。 */
  name: string;
  /** Tool の説明。モデルに「何を提出するのか」を伝える。 */
  description: string;
  /** 1 回の出力で許す最大件数。TS 側の打ち切り(`parseChecklistItems`)と必ず同じ値を渡す。 */
  maxItems: number;
  /** `title` の書き方を示す例。Feature ごとに題材を変える。 */
  titleExample: string;
}

/**
 * `{ category, title, description? }[]` を受け取る Tool 入力スキーマを組み立てる。
 *
 * `maxItems` はモデル側の遵守が保証されないため、実効的な上限は `parseChecklistItems` の
 * 打ち切りが担う。ここでの指定はモデルへのヒント。
 */
export function buildChecklistItemsTool(options: ChecklistItemsToolOptions) {
  return {
    name: options.name,
    description: options.description,
    input_schema: {
      type: 'object' as const,
      properties: {
        items: {
          type: 'array' as const,
          maxItems: options.maxItems,
          items: {
            type: 'object' as const,
            properties: {
              category: {
                type: 'string' as const,
                enum: CATEGORY_VALUES,
                description:
                  'TECH(技術) / LEGAL(法務) / MARKETING(マーケ) / UX(ユーザー体験) / OTHER のいずれか',
              },
              title: {
                type: 'string' as const,
                maxLength: 200,
                description: `実行可能な短い動詞句(例: 「${options.titleExample}」)`,
              },
              description: {
                type: 'string' as const,
                maxLength: 2000,
                description: '補足が要るときだけ書く。不要なら省略する',
              },
            },
            required: ['category', 'title'],
          },
        },
      },
      required: ['items'],
    },
  };
}

/**
 * Tool Use で返ってきた未検証の `input` を、`Category` enum で絞った安全な配列にする。
 *
 * Tool 側の JSON スキーマで形は強制しているが、モデル出力が完全に従う保証は無いので
 * 二重防御で TS 側でも検証する。不正な category / 空 title の項目は捨てる
 * (全部捨てた場合は呼び出し側で 502 相当のエラーにする契約)。
 */
/**
 * 既に存在する title と完全一致する項目を落とす。
 *
 * プロンプトでも「既存と重複するな」と指示するが、モデルの遵守は保証されない
 * (F17 の実測で完全一致の重複が発生した)。コードで確定的に落とせる制約を
 * モデルに委ねないための後段フィルタ。
 *
 * 突き合わせるのは **プロンプトに渡した title と同じ範囲** にすること。渡していない
 * 項目まで弾くと、ユーザーから見て「なぜ生成されなかったか」が説明できなくなる。
 *
 * 表現違いの意味的な重複は落とせない。そこはプロンプト側の指示に任せる。
 */
export function excludeKnownTitles(
  items: readonly GeneratedChecklistItem[],
  knownTitles: readonly string[],
): GeneratedChecklistItem[] {
  if (knownTitles.length === 0) return [...items];
  const known = new Set(knownTitles);
  return items.filter((item) => !known.has(item.title));
}

export function parseChecklistItems(
  input: unknown,
  allowedCategories: Category[],
  maxItems: number,
): GeneratedChecklistItem[] {
  const obj = (input ?? {}) as { items?: unknown };
  if (!Array.isArray(obj.items)) return [];
  const allowed = new Set<string>(allowedCategories);
  const result: GeneratedChecklistItem[] = [];
  for (const raw of obj.items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as { category?: unknown; title?: unknown; description?: unknown };
    if (typeof item.category !== 'string' || !allowed.has(item.category)) continue;
    if (typeof item.title !== 'string' || !item.title.trim()) continue;
    const description =
      typeof item.description === 'string' && item.description.trim()
        ? item.description.trim()
        : undefined;
    result.push({
      category: item.category as Category,
      title: item.title.trim(),
      ...(description !== undefined ? { description } : {}),
    });
    if (result.length >= maxItems) break;
  }
  return result;
}
