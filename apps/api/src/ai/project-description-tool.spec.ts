import { describe, expect, it } from 'vitest';

import {
  parseProjectDescription,
  SUBMIT_PROJECT_DESCRIPTION_TOOL,
} from './project-description-tool';

describe('parseProjectDescription', () => {
  it('概要文を取り出して前後の空白を落とす', () => {
    expect(
      parseProjectDescription({ description: '  個人開発者向けのリリース支援ツール  ' }, 100),
    ).toEqual({ description: '個人開発者向けのリリース支援ツール', truncated: false });
  });

  it('上限を超える本文は切り詰め、truncated を立てる', () => {
    const long = 'あ'.repeat(50);
    expect(parseProjectDescription({ description: long }, 10)).toEqual({
      description: 'あ'.repeat(10),
      truncated: true,
    });
  });

  it('保存されうる値なので「…」は付けない', () => {
    const result = parseProjectDescription({ description: 'あ'.repeat(50) }, 10);
    expect(result?.description.endsWith('…')).toBe(false);
  });

  it('上限ちょうどは切り詰めない', () => {
    const exact = 'あ'.repeat(10);
    expect(parseProjectDescription({ description: exact }, 10)).toEqual({
      description: exact,
      truncated: false,
    });
  });

  it('空文字 / 空白のみは null', () => {
    expect(parseProjectDescription({ description: '' }, 100)).toBeNull();
    expect(parseProjectDescription({ description: '   ' }, 100)).toBeNull();
  });

  it('description が無い / 型が違う入力は null', () => {
    expect(parseProjectDescription({}, 100)).toBeNull();
    expect(parseProjectDescription({ description: 123 }, 100)).toBeNull();
    expect(parseProjectDescription(null, 100)).toBeNull();
    expect(parseProjectDescription(undefined, 100)).toBeNull();
  });
});

describe('SUBMIT_PROJECT_DESCRIPTION_TOOL', () => {
  it('description を必須にしている', () => {
    expect(SUBMIT_PROJECT_DESCRIPTION_TOOL.input_schema.required).toEqual(['description']);
  });
});
