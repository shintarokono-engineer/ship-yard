import { describe, expect, it } from 'vitest';

import { Category } from '@shipyard/db';

import {
  buildChecklistItemsTool,
  excludeKnownTitles,
  parseChecklistItems,
} from './checklist-items-tool';

const ALL: Category[] = [
  Category.TECH,
  Category.LEGAL,
  Category.MARKETING,
  Category.UX,
  Category.OTHER,
];

describe('buildChecklistItemsTool', () => {
  it('渡した name / description / maxItems / titleExample がスキーマに反映される', () => {
    const tool = buildChecklistItemsTool({
      name: 'submit_x',
      description: 'X を提出する。',
      maxItems: 7,
      titleExample: 'LP のコピーを書き直す',
    });

    expect(tool.name).toBe('submit_x');
    expect(tool.description).toBe('X を提出する。');
    expect(tool.input_schema.properties.items.maxItems).toBe(7);
    expect(tool.input_schema.properties.items.items.properties.title.description).toBe(
      '実行可能な短い動詞句(例: 「LP のコピーを書き直す」)',
    );
  });

  it('CHECKLIST_GEN の従来スキーマと同一の JSON を生成する(切り出しによる退行の検出)', () => {
    // 切り出し前に checklist-gen.service.ts が直書きしていた SUBMIT_CHECKLIST_TOOL の写し。
    // ここが食い違うと、既存の CHECKLIST_GEN の出力品質が静かに変わる。
    const expected = {
      name: 'submit_checklist',
      description: 'リリース前チェックリストの項目一覧を提出する。',
      input_schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            maxItems: 30,
            items: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  enum: ['TECH', 'LEGAL', 'MARKETING', 'UX', 'OTHER'],
                  description:
                    'TECH(技術) / LEGAL(法務) / MARKETING(マーケ) / UX(ユーザー体験) / OTHER のいずれか',
                },
                title: {
                  type: 'string',
                  maxLength: 200,
                  description: '実行可能な短い動詞句(例: 「OG 画像を用意する」)',
                },
                description: {
                  type: 'string',
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

    const actual = buildChecklistItemsTool({
      name: 'submit_checklist',
      description: 'リリース前チェックリストの項目一覧を提出する。',
      maxItems: 30,
      titleExample: 'OG 画像を用意する',
    });

    expect(actual).toEqual(expected);
  });
});

describe('parseChecklistItems', () => {
  it('正常な項目を返し、title と description を trim する', () => {
    const items = parseChecklistItems(
      { items: [{ category: 'TECH', title: '  CI を通す  ', description: '  補足  ' }] },
      ALL,
      30,
    );
    expect(items).toEqual([{ category: 'TECH', title: 'CI を通す', description: '補足' }]);
  });

  it('description が空白のみなら省略する', () => {
    const items = parseChecklistItems(
      { items: [{ category: 'UX', title: '導線を直す', description: '   ' }] },
      ALL,
      30,
    );
    expect(items).toEqual([{ category: 'UX', title: '導線を直す' }]);
    expect(items[0]).not.toHaveProperty('description');
  });

  it('未知の category を持つ項目を捨てる', () => {
    const items = parseChecklistItems(
      {
        items: [
          { category: 'SALES', title: '捨てられる' },
          { category: 'TECH', title: '残る' },
        ],
      },
      ALL,
      30,
    );
    expect(items.map((i) => i.title)).toEqual(['残る']);
  });

  it('allowedCategories に含まれない category を捨てる(呼び出し側の絞り込みを尊重する)', () => {
    const items = parseChecklistItems(
      {
        items: [
          { category: 'MARKETING', title: '捨てられる' },
          { category: 'TECH', title: '残る' },
        ],
      },
      [Category.TECH],
      30,
    );
    expect(items.map((i) => i.title)).toEqual(['残る']);
  });

  it('title が空文字・空白のみの項目を捨てる', () => {
    const items = parseChecklistItems(
      {
        items: [
          { category: 'TECH', title: '' },
          { category: 'TECH', title: '   ' },
          { category: 'TECH', title: '残る' },
        ],
      },
      ALL,
      30,
    );
    expect(items.map((i) => i.title)).toEqual(['残る']);
  });

  it('maxItems で打ち切る', () => {
    const raw = Array.from({ length: 13 }, (_, i) => ({ category: 'TECH', title: `t${i}` }));
    expect(parseChecklistItems({ items: raw }, ALL, 12)).toHaveLength(12);
    // 打ち切りは maxItems ごとに変わる(CHECKLIST_GEN=30 / F17=12 を同じ関数で扱うため)。
    expect(parseChecklistItems({ items: raw }, ALL, 30)).toHaveLength(13);
  });

  it('items が配列でないときは空配列を返す', () => {
    expect(parseChecklistItems({ items: 'nope' }, ALL, 30)).toEqual([]);
    expect(parseChecklistItems({}, ALL, 30)).toEqual([]);
    expect(parseChecklistItems(null, ALL, 30)).toEqual([]);
  });

  it('要素がオブジェクトでないものを捨てる', () => {
    const items = parseChecklistItems(
      { items: ['文字列', null, 42, { category: 'TECH', title: '残る' }] },
      ALL,
      30,
    );
    expect(items.map((i) => i.title)).toEqual(['残る']);
  });

  it('全項目が不正なら空配列を返す(呼び出し側が 502 にする契約)', () => {
    const items = parseChecklistItems(
      { items: [{ category: 'SALES', title: 'x' }, { category: 'TECH' }] },
      ALL,
      30,
    );
    expect(items).toEqual([]);
  });
});

describe('excludeKnownTitles', () => {
  const ITEMS = [
    { category: Category.TECH, title: 'CI を通す' },
    { category: Category.UX, title: '導線を直す' },
    { category: Category.LEGAL, title: '利用規約を書く' },
  ];

  it('既存 title と完全一致する項目を落とす', () => {
    const out = excludeKnownTitles(ITEMS, ['導線を直す']);
    expect(out.map((i) => i.title)).toEqual(['CI を通す', '利用規約を書く']);
  });

  it('全件が既存と重複したら空配列を返す(呼び出し側は 0 件として扱う)', () => {
    expect(
      excludeKnownTitles(
        ITEMS,
        ITEMS.map((i) => i.title),
      ),
    ).toEqual([]);
  });

  it('既存 title が空なら何も落とさない', () => {
    expect(excludeKnownTitles(ITEMS, [])).toHaveLength(3);
  });

  it('category が違っても title が同じなら落とす(重複の判定は title のみ)', () => {
    const out = excludeKnownTitles(
      [{ category: Category.MARKETING, title: 'CI を通す' }],
      ['CI を通す'],
    );
    expect(out).toEqual([]);
  });

  it('部分一致では落とさない(完全一致のみ)', () => {
    const out = excludeKnownTitles(ITEMS, ['CI']);
    expect(out).toHaveLength(3);
  });

  it('入力配列を破壊しない', () => {
    const input = [...ITEMS];
    excludeKnownTitles(input, ['CI を通す']);
    expect(input).toHaveLength(3);
  });
});
