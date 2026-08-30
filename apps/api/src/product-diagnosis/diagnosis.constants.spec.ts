import { describe, expect, it } from 'vitest';

import {
  DIAGNOSIS_AXES,
  DIAGNOSIS_AXIS_RUBRIC,
  formatRubricForPrompt,
} from './diagnosis.constants';

/**
 * PRODUCT_DIAGNOSIS の rubric 定数のテスト(ADR-016)。
 *
 * 守りたいのは `validation.constants.spec.ts` と同じ 2 点(軸キーの不変性と、criteria を
 * 「記述の評価」 に戻さないこと)。差分は評価軸と、`featureCompleteness` /
 * `releaseReadiness` が**実データ基準のため ADR-016 の変更対象外**である点。
 */
describe('DIAGNOSIS_AXIS_RUBRIC', () => {
  it('軸のキーが変わっていない(既存レコードの breakdown / Suggestion.axis 互換)', () => {
    expect(DIAGNOSIS_AXES).toEqual([
      'differentiation',
      'targetClarity',
      'featureCompleteness',
      'releaseReadiness',
      'competitiveAdvantage',
    ]);
  });

  it('全軸に label と criteria が揃っている', () => {
    for (const axis of DIAGNOSIS_AXES) {
      expect(DIAGNOSIS_AXIS_RUBRIC[axis].label.length).toBeGreaterThan(0);
      expect(DIAGNOSIS_AXIS_RUBRIC[axis].criteria.length).toBeGreaterThan(0);
    }
  });

  it('ラベルが ADR-016 の実質評価版になっている', () => {
    // FE の `DIAGNOSIS_AXIS_LABEL`(apps/web/src/lib/api/types.ts)と同じ文字列を保つこと。
    expect(DIAGNOSIS_AXIS_RUBRIC.differentiation.label).toBe('差別化の実効性');
    expect(DIAGNOSIS_AXIS_RUBRIC.targetClarity.label).toBe('対象の到達可能性');
    // 実データ(ChecklistItem の DONE 比率 / LandingPage.publishedAt)を見る軸は変更対象外。
    expect(DIAGNOSIS_AXIS_RUBRIC.featureCompleteness.label).toBe('機能完成度');
    expect(DIAGNOSIS_AXIS_RUBRIC.releaseReadiness.label).toBe('リリース準備度');
    expect(DIAGNOSIS_AXIS_RUBRIC.competitiveAdvantage.label).toBe('競合優位性');
  });

  // 単語一致のため「明文化されているか」 等の言い換えはすり抜ける。完全な検知ではなく、
  // 最も典型的な差し戻し(criteria に「言語化」 を書く)を止めるための安価なガード。
  it('criteria が「記述の評価」 に戻っていない(ADR-016 の回帰防止)', () => {
    for (const axis of DIAGNOSIS_AXES) {
      expect(DIAGNOSIS_AXIS_RUBRIC[axis].criteria).not.toContain('言語化');
    }
  });

  it('差別化は訴求文だけの差別化を評価しないことを明示している', () => {
    expect(DIAGNOSIS_AXIS_RUBRIC.differentiation.criteria).toContain('評価しない');
  });
});

describe('formatRubricForPrompt', () => {
  it('全 5 軸のキー・ラベル・criteria を含む', () => {
    const prompt = formatRubricForPrompt();
    for (const axis of DIAGNOSIS_AXES) {
      expect(prompt).toContain(axis);
      expect(prompt).toContain(DIAGNOSIS_AXIS_RUBRIC[axis].label);
      expect(prompt).toContain(DIAGNOSIS_AXIS_RUBRIC[axis].criteria);
    }
  });

  it('軸ごとに 1 行で、宣言順に並ぶ', () => {
    const lines = formatRubricForPrompt().split('\n');
    expect(lines).toHaveLength(DIAGNOSIS_AXES.length);
    lines.forEach((line, idx) => {
      expect(line.startsWith(`${idx + 1}. **${DIAGNOSIS_AXES[idx]}**`)).toBe(true);
    });
  });
});
