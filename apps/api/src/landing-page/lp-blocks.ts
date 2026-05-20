/**
 * ランディングページ(LP)のブロック型定義と AI Tool Use スキーマ(ADR-009)。
 *
 * LP は `LandingPage.blocks`(Json)に「ブロックの配列」として保存される。各ブロックは
 * `type` フィールドで判別する判別ユニオン。本ファイルが LP ブロック構造の唯一の真実の源で、
 * AI Tool Use の `input_schema` / 生成結果のバリデーション(`parseLpBlocks`)の双方で参照する。
 *
 * フロント(Day 31-32 のプレビュー / 編集 UI、レンダリング)は web 側で別途型定義する
 * (既存 enum 群と同じく packages 共通化は将来課題、`apps/web/src/lib/api/types.ts` 参照)。
 */

/** LP ブロックの種別(ADR-009 の MVP 5 種 + footer 任意)。 */
export const LP_BLOCK_TYPES = [
  'hero',
  'features',
  'stats',
  'testimonial',
  'cta',
  'footer',
] as const;
export type LpBlockType = (typeof LP_BLOCK_TYPES)[number];

/** ファーストビュー。見出し + サブコピー + CTA ボタン。 */
export interface HeroBlock {
  type: 'hero';
  heading: string;
  sub: string;
  ctaText: string;
  ctaHref: string;
  /** 任意のヒーロー画像 URL。 */
  image?: string;
}

/** 主要機能の紹介。複数の機能項目を持つ。 */
export interface FeaturesBlock {
  type: 'features';
  title: string;
  items: { icon: string; title: string; body: string }[];
}

/** 数値アピール(導入実績・パフォーマンス等)。 */
export interface StatsBlock {
  type: 'stats';
  items: { value: string; label: string }[];
}

/** 利用者の声。 */
export interface TestimonialBlock {
  type: 'testimonial';
  quote: string;
  name: string;
  role: string;
  /** 任意のアバター画像 URL。 */
  avatar?: string;
}

/** 行動喚起(ページ下部の CTA)。 */
export interface CtaBlock {
  type: 'cta';
  heading: string;
  buttonText: string;
  buttonHref: string;
}

/** フッター(任意)。 */
export interface FooterBlock {
  type: 'footer';
  copyright: string;
  links: { label: string; href: string }[];
}

/** LP を構成する 1 ブロック(判別ユニオン)。 */
export type LpBlock =
  | HeroBlock
  | FeaturesBlock
  | StatsBlock
  | TestimonialBlock
  | CtaBlock
  | FooterBlock;

/**
 * AI Tool Use(`submit_landing_page`)の入力スキーマ。
 *
 * 判別ユニオンを JSON Schema の `oneOf` で厳密表現すると Tool Use の安定性が読めないため、
 * 「`type` 必須 + 全ブロックのフィールドを optional で列挙」のゆるいスキーマにし、生成後に
 * `parseLpBlocks` で TS 側バリデーションを行う(CHECKLIST_GEN と同じ「Tool スキーマ + LLM 強制
 * + TS 側検証」の 3 段防御)。
 */
export const SUBMIT_LANDING_PAGE_TOOL = {
  name: 'submit_landing_page',
  description: '生成したランディングページをブロック構造として提出する。',
  input_schema: {
    type: 'object' as const,
    properties: {
      blocks: {
        type: 'array',
        description: 'ランディングページを構成するブロックの配列。表示順に並べる。',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [...LP_BLOCK_TYPES],
              description: 'ブロック種別。',
            },
            heading: { type: 'string', description: 'hero / cta の見出し。' },
            sub: { type: 'string', description: 'hero のサブコピー。' },
            ctaText: { type: 'string', description: 'hero の CTA ボタン文言。' },
            ctaHref: { type: 'string', description: 'hero の CTA リンク先。' },
            image: { type: 'string', description: 'hero の画像 URL(任意)。' },
            title: { type: 'string', description: 'features の見出し。' },
            items: {
              type: 'array',
              description:
                'features は {icon,title,body}、stats は {value,label}、footer は {label,href} の配列。',
              items: { type: 'object' },
            },
            quote: { type: 'string', description: 'testimonial の引用文。' },
            name: { type: 'string', description: 'testimonial の発言者名。' },
            role: { type: 'string', description: 'testimonial の発言者の肩書。' },
            avatar: { type: 'string', description: 'testimonial のアバター URL(任意)。' },
            buttonText: { type: 'string', description: 'cta のボタン文言。' },
            buttonHref: { type: 'string', description: 'cta のボタンリンク先。' },
            copyright: { type: 'string', description: 'footer の著作権表記。' },
          },
          required: ['type'],
        },
      },
    },
    required: ['blocks'],
  },
};

/** LP に含められるブロック数の上限(暴走防止)。 */
export const LP_MAX_BLOCKS = 12;

/** LP 生成の Anthropic API `max_tokens`。複数ブロック × 平均 + 余裕 ≒ 4096。 */
export const LP_GEN_MAX_TOKENS = 4096;

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asOptionalString(v: unknown): string | undefined {
  const s = asString(v);
  return s.length > 0 ? s : undefined;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * AI が生成した生のブロック配列を `LpBlock[]` に正規化・バリデーションする。
 *
 * - `type` が未知のブロックはスキップ(LLM の取りこぼしを握りつぶす)
 * - 各ブロックの必須フィールドが空文字なら、そのブロックは不完全としてスキップ
 * - 結果が空配列なら呼び出し側で `AIBadResponseError` にする想定(本関数は throw しない)
 */
export function parseLpBlocks(raw: unknown): LpBlock[] {
  const rawBlocks = asArray(raw);
  const result: LpBlock[] = [];

  for (const item of rawBlocks) {
    if (typeof item !== 'object' || item === null) continue;
    const b = item as Record<string, unknown>;
    const type = asString(b.type);

    switch (type) {
      case 'hero': {
        const heading = asString(b.heading);
        const ctaText = asString(b.ctaText);
        const ctaHref = asString(b.ctaHref);
        if (!heading || !ctaText || !ctaHref) break;
        result.push({
          type: 'hero',
          heading,
          sub: asString(b.sub),
          ctaText,
          ctaHref,
          image: asOptionalString(b.image),
        });
        break;
      }
      case 'features': {
        const items = asArray(b.items)
          .map((it) => {
            const o = (typeof it === 'object' && it !== null ? it : {}) as Record<string, unknown>;
            return { icon: asString(o.icon), title: asString(o.title), body: asString(o.body) };
          })
          .filter((it) => it.title.length > 0);
        if (items.length === 0) break;
        result.push({ type: 'features', title: asString(b.title), items });
        break;
      }
      case 'stats': {
        const items = asArray(b.items)
          .map((it) => {
            const o = (typeof it === 'object' && it !== null ? it : {}) as Record<string, unknown>;
            return { value: asString(o.value), label: asString(o.label) };
          })
          .filter((it) => it.value.length > 0 && it.label.length > 0);
        if (items.length === 0) break;
        result.push({ type: 'stats', items });
        break;
      }
      case 'testimonial': {
        const quote = asString(b.quote);
        if (!quote) break;
        result.push({
          type: 'testimonial',
          quote,
          name: asString(b.name),
          role: asString(b.role),
          avatar: asOptionalString(b.avatar),
        });
        break;
      }
      case 'cta': {
        const heading = asString(b.heading);
        const buttonText = asString(b.buttonText);
        const buttonHref = asString(b.buttonHref);
        if (!heading || !buttonText || !buttonHref) break;
        result.push({ type: 'cta', heading, buttonText, buttonHref });
        break;
      }
      case 'footer': {
        // footer のリンクは Tool スキーマ上 `items` 配列に入る(input_schema の description 参照)。
        const links = asArray(b.items)
          .map((it) => {
            const o = (typeof it === 'object' && it !== null ? it : {}) as Record<string, unknown>;
            return { label: asString(o.label), href: asString(o.href) };
          })
          .filter((it) => it.label.length > 0);
        result.push({ type: 'footer', copyright: asString(b.copyright), links });
        break;
      }
      default:
        // 未知の type はスキップ
        break;
    }
    if (result.length >= LP_MAX_BLOCKS) break;
  }

  return result;
}
