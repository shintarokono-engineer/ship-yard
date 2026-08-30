import { describe, expect, it } from 'vitest';

import {
  formatValidationRubricForPrompt,
  VALIDATION_AXES,
  VALIDATION_AXIS_RUBRIC,
  VALIDATION_RECOMMENDATION_GUIDANCE,
} from './validation.constants';

/**
 * IDEA_VALIDATION の rubric 定数のテスト(ADR-016)。
 *
 * 守りたいのは 2 点:
 *   1. **軸のキーを変えない** — `IdeaValidation.breakdown` と `Suggestion.axis` はキーで永続化
 *      されているため、キーを変えると既存レコードが読めなくなる
 *   2. **criteria を「記述の評価」 に戻さない** — ADR-016 の是正対象。criteria が
 *      「〜が言語化されているか」 を基準にすると、提案が構造的に作文添削になる
 */
describe('VALIDATION_AXIS_RUBRIC', () => {
  it('軸のキーが変わっていない(既存レコードの breakdown / Suggestion.axis 互換)', () => {
    expect(VALIDATION_AXES).toEqual([
      'problemClarity',
      'targetClarity',
      'differentiation',
      'competitiveAdvantage',
      'marketPotential',
    ]);
  });

  it('全軸に label と criteria が揃っている', () => {
    for (const axis of VALIDATION_AXES) {
      expect(VALIDATION_AXIS_RUBRIC[axis].label.length).toBeGreaterThan(0);
      expect(VALIDATION_AXIS_RUBRIC[axis].criteria.length).toBeGreaterThan(0);
    }
  });

  it('ラベルが ADR-016 の実質評価版になっている', () => {
    // FE の `VALIDATION_AXIS_LABEL`(apps/web/src/lib/api/types.ts)と同じ文字列を保つこと。
    // 片方だけ変えると、提案の axisLabel とグラフの軸名がズレる。
    expect(VALIDATION_AXIS_RUBRIC.problemClarity.label).toBe('課題の強度');
    expect(VALIDATION_AXIS_RUBRIC.targetClarity.label).toBe('対象の到達可能性');
    expect(VALIDATION_AXIS_RUBRIC.differentiation.label).toBe('打ち手の妥当性');
    expect(VALIDATION_AXIS_RUBRIC.competitiveAdvantage.label).toBe('競合優位性');
    expect(VALIDATION_AXIS_RUBRIC.marketPotential.label).toBe('市場性');
  });

  // 単語一致のため「明文化されているか」 等の言い換えはすり抜ける。完全な検知ではなく、
  // 最も典型的な差し戻し(criteria に「言語化」 を書く)を止めるための安価なガード。
  it('criteria が「記述の評価」 に戻っていない(ADR-016 の回帰防止)', () => {
    for (const axis of VALIDATION_AXES) {
      expect(VALIDATION_AXIS_RUBRIC[axis].criteria).not.toContain('言語化');
    }
  });

  it('recommendation の判定基準が現行のラベルを参照している', () => {
    expect(VALIDATION_RECOMMENDATION_GUIDANCE).toContain(
      VALIDATION_AXIS_RUBRIC.problemClarity.label,
    );
    expect(VALIDATION_RECOMMENDATION_GUIDANCE).toContain(
      VALIDATION_AXIS_RUBRIC.competitiveAdvantage.label,
    );
  });
});

describe('formatValidationRubricForPrompt', () => {
  it('全 5 軸のキー・ラベル・criteria を含む', () => {
    const prompt = formatValidationRubricForPrompt();
    for (const axis of VALIDATION_AXES) {
      expect(prompt).toContain(axis);
      expect(prompt).toContain(VALIDATION_AXIS_RUBRIC[axis].label);
      expect(prompt).toContain(VALIDATION_AXIS_RUBRIC[axis].criteria);
    }
  });

  it('軸ごとに 1 行で、宣言順に並ぶ', () => {
    const lines = formatValidationRubricForPrompt().split('\n');
    expect(lines).toHaveLength(VALIDATION_AXES.length);
    lines.forEach((line, idx) => {
      expect(line.startsWith(`${idx + 1}. **${VALIDATION_AXES[idx]}**`)).toBe(true);
    });
  });
});
