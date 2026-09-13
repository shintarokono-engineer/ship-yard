import { describe, expect, it } from 'vitest';

import {
  parsePublicCheckOutput,
  parseValidationOutput,
  SUBMIT_IDEA_VALIDATION_TOOL,
  SUBMIT_PUBLIC_CHECK_TOOL,
} from './validation-schema';
import {
  PUBLIC_CHECK_AXES,
  VALIDATION_AXES,
  VALIDATION_AXIS_MAX_SCORE,
} from './validation.constants';

function validRaw(overrides: Record<string, unknown> = {}) {
  const breakdown = Object.fromEntries(
    VALIDATION_AXES.map((axis) => [axis, { score: 10, comment: `${axis} の根拠` }]),
  );
  return {
    totalScore: VALIDATION_AXES.length * 10,
    recommendation: 'PIVOT',
    breakdown,
    suggestions: [
      { priority: 'HIGH', title: '提案 1', body: '本文 1', axis: 'problemClarity' },
      { priority: 'MEDIUM', title: '提案 2', body: '本文 2', axis: 'targetClarity' },
      { priority: 'LOW', title: '提案 3', body: '本文 3', axis: 'differentiation' },
    ],
    competitorRefs: [],
    ...overrides,
  };
}

describe('parseValidationOutput の整合性アサート', () => {
  it('totalScore が breakdown の合計と一致しなければ throw する', () => {
    expect(() => parseValidationOutput(validRaw({ totalScore: 99 }))).toThrow();
  });

  it('軸が欠けていれば throw する', () => {
    const raw = validRaw();
    delete (raw.breakdown as Record<string, unknown>).marketPotential;
    expect(() => parseValidationOutput(raw)).toThrow();
  });

  it('score は軸の上限にクランプされる', () => {
    const raw = validRaw({
      breakdown: {
        ...Object.fromEntries(
          VALIDATION_AXES.map((axis) => [axis, { score: 10, comment: `${axis} の根拠` }]),
        ),
        problemClarity: { score: 999, comment: '過大な点数' },
      },
      // クランプ後の合計と totalScore を合わせないと整合性アサートに落ちるため、期待値を再計算する。
      totalScore: VALIDATION_AXIS_MAX_SCORE + (VALIDATION_AXES.length - 1) * 10,
    });
    expect(parseValidationOutput(raw).breakdown.problemClarity.score).toBe(
      VALIDATION_AXIS_MAX_SCORE,
    );
  });
});

describe('SUBMIT_IDEA_VALIDATION_TOOL の不変性(ADR-015 の引数化が有料版に透過であること)', () => {
  // 既定引数での出力が引数化前と完全一致することを担保する。description まで見るのは、
  // LLM への指示そのもので、型が通っても出力が変わるため。
  const schema = SUBMIT_IDEA_VALIDATION_TOOL.input_schema;

  it('tool 名と description が変わっていない', () => {
    expect(SUBMIT_IDEA_VALIDATION_TOOL.name).toBe('submit_idea_validation');
    expect(SUBMIT_IDEA_VALIDATION_TOOL.description).toBe(
      'アイデア検証の結果を提出する。totalScore は breakdown の 5 軸合計と一致させ、recommendation は基準に従って判定すること。',
    );
  });

  it('プロパティの並び順が変わっていない', () => {
    expect(Object.keys(schema.properties)).toEqual([
      'totalScore',
      'recommendation',
      'breakdown',
      'suggestions',
      'competitorRefs',
    ]);
  });

  it('required の並び順が変わっていない', () => {
    expect(schema.required).toEqual([
      'totalScore',
      'recommendation',
      'breakdown',
      'suggestions',
      'competitorRefs',
    ]);
  });

  it('breakdown は全軸を要求し続けている(既存レコード互換の防波堤)', () => {
    expect(schema.properties.breakdown.required).toEqual([...VALIDATION_AXES]);
  });

  it('totalScore と breakdown の description が変わっていない', () => {
    expect(schema.properties.totalScore).toMatchObject({
      minimum: 0,
      maximum: 100,
      description:
        '総合スコア(0-100)。breakdown の 5 軸合計と必ず一致させること。不一致は不正回答として扱われる。',
    });
    expect(schema.properties.breakdown).toMatchObject({
      description:
        '5 軸ブレークダウン。全 5 軸を必ず含めること。各軸は score(0-20)と comment(根拠)を持つ。',
    });
  });
});

describe('SUBMIT_PUBLIC_CHECK_TOOL(無料公開版、ADR-015)', () => {
  const schema = SUBMIT_PUBLIC_CHECK_TOOL.input_schema;

  it('recommendation と競合参照を要求しない', () => {
    // Web Search を回さないため、結論も競合参照も出さない。
    expect(Object.keys(schema.properties)).toEqual(['totalScore', 'breakdown', 'suggestions']);
    expect(schema.required).toEqual(['totalScore', 'breakdown', 'suggestions']);
  });

  it('満点が 3 軸ぶんの 60 点になっている(100 点への正規化は表示層の仕事)', () => {
    expect(schema.properties.totalScore).toMatchObject({ maximum: 60 });
  });

  it('breakdown と suggestions が 3 軸に限定されている', () => {
    expect(schema.properties.breakdown.required).toEqual([...PUBLIC_CHECK_AXES]);
    expect(schema.properties.suggestions.items.properties.axis.enum).toEqual([
      ...PUBLIC_CHECK_AXES,
    ]);
  });
});

describe('parsePublicCheckOutput', () => {
  function publicRaw(overrides: Record<string, unknown> = {}) {
    return {
      totalScore: PUBLIC_CHECK_AXES.length * 12,
      breakdown: Object.fromEntries(
        PUBLIC_CHECK_AXES.map((axis) => [axis, { score: 12, comment: `${axis} の根拠` }]),
      ),
      suggestions: [
        { priority: 'HIGH', title: '提案 1', body: '本文 1', axis: 'problemClarity' },
        { priority: 'MEDIUM', title: '提案 2', body: '本文 2', axis: 'targetClarity' },
        { priority: 'LOW', title: '提案 3', body: '本文 3', axis: 'differentiation' },
      ],
      ...overrides,
    };
  }

  it('3 軸を 0〜60 の内部値のまま返す(表示層で正規化するため)', () => {
    const out = parsePublicCheckOutput(publicRaw());
    expect(out.totalScore).toBe(36);
    expect(Object.keys(out.breakdown)).toEqual([...PUBLIC_CHECK_AXES]);
  });

  it('ロックした 2 軸に紐づく提案は落とす(採点していない軸には根拠が無い)', () => {
    const raw = publicRaw({
      suggestions: [
        { priority: 'HIGH', title: '提案 1', body: '本文 1', axis: 'problemClarity' },
        { priority: 'HIGH', title: '提案 2', body: '本文 2', axis: 'targetClarity' },
        { priority: 'HIGH', title: '提案 3', body: '本文 3', axis: 'differentiation' },
        { priority: 'HIGH', title: '競合の話', body: '本文 4', axis: 'competitiveAdvantage' },
        { priority: 'HIGH', title: '市場の話', body: '本文 5', axis: 'marketPotential' },
      ],
    });
    const axes = parsePublicCheckOutput(raw).suggestions.map((s) => s.axis);
    expect(axes).toEqual([...PUBLIC_CHECK_AXES]);
  });

  it('5 軸ぶんの合計が来たら整合性アサートで throw する', () => {
    // 5 軸で採点した値をそのまま公開版として保存してしまう事故を防ぐ。
    expect(() => parsePublicCheckOutput(publicRaw({ totalScore: 60 }))).toThrow();
  });

  it('3 軸のうち 1 つでも欠けたら throw する', () => {
    const raw = publicRaw();
    delete (raw.breakdown as Record<string, unknown>).differentiation;
    expect(() => parsePublicCheckOutput(raw)).toThrow();
  });
});
