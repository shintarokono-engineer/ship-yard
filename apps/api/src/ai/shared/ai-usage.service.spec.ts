import { Feature } from '@shipyard/db';

import { AI_MODEL_HAIKU, AI_MODEL_SONNET, EMBEDDING_MODEL } from './ai.constants';
import { creditsForUsage, estimateCostJpy, sumCostJpy } from './ai-usage.service';

describe('creditsForUsage(ADR-012 / ADR-014)', () => {
  it('Haiku 4.5 は 1cr', () => {
    expect(creditsForUsage(AI_MODEL_HAIKU, Feature.CHECKLIST_GEN)).toBe(1);
  });

  it('Sonnet 4 は 3cr', () => {
    expect(creditsForUsage(AI_MODEL_SONNET, Feature.DRAFT_GEN)).toBe(3);
  });

  it('Feature.OTHER(裏方 embedding / RAG 検索)はモデルに関わらず 0cr', () => {
    expect(creditsForUsage(AI_MODEL_SONNET, Feature.OTHER)).toBe(0);
    expect(creditsForUsage(EMBEDDING_MODEL, Feature.OTHER)).toBe(0);
  });

  it('FEATURE_CREDIT_OVERRIDES 登録済み(ANNOUNCEMENT_GEN)は override 値 4cr を優先', () => {
    expect(creditsForUsage(AI_MODEL_SONNET, Feature.ANNOUNCEMENT_GEN)).toBe(4);
  });

  it('turnCount で乗算する(override 無しの Sonnet 2 ターンは 3cr × 2 = 6cr)', () => {
    expect(creditsForUsage(AI_MODEL_SONNET, Feature.DRAFT_GEN, 2)).toBe(6);
  });

  it('診断 / 検証は override 5 × turnCount 2 = 10cr(ADR-016)', () => {
    expect(creditsForUsage(AI_MODEL_SONNET, Feature.PRODUCT_DIAGNOSIS, 2)).toBe(10);
    expect(creditsForUsage(AI_MODEL_SONNET, Feature.IDEA_VALIDATION, 2)).toBe(10);
  });

  it('診断 / 検証の cr はモデルに依存しない(turn 1 を Haiku にしても下がらない)', () => {
    // ADR-016 の要:実費を下げても cr が追随して下がると、Pro の 300cr で回せる回数が
    // 増えて削減分が相殺される。支出の天井を決めているのは実費ではなく cr 価格なので、
    // override でモデル式から切り離してある。ここが崩れると赤字構造に戻る。
    expect(creditsForUsage(AI_MODEL_HAIKU, Feature.PRODUCT_DIAGNOSIS, 2)).toBe(10);
    expect(creditsForUsage(AI_MODEL_HAIKU, Feature.IDEA_VALIDATION, 2)).toBe(10);
  });

  it('未知モデルは fallback の 3cr', () => {
    expect(creditsForUsage('unknown-model-9', Feature.DRAFT_GEN)).toBe(3);
  });
});

describe('estimateCostJpy', () => {
  it('Sonnet 4 で 100万 in / 100万 out ≒ (3 + 15) USD × 150 円', () => {
    expect(estimateCostJpy(AI_MODEL_SONNET, 1_000_000, 1_000_000)).toBe((18 * 150).toFixed(4));
  });

  it('0 トークンは 0 円', () => {
    expect(estimateCostJpy(AI_MODEL_HAIKU, 0, 0)).toBe('0.0000');
  });

  it('Decimal(10,4) 相当の小数 4 桁文字列を返す', () => {
    expect(estimateCostJpy(AI_MODEL_HAIKU, 1000, 1000)).toMatch(/^\d+\.\d{4}$/);
  });
});

describe('sumCostJpy(ADR-016、2-step のモデル混在)', () => {
  it('turn ごとに単価を分けて積算する', () => {
    // Haiku 100万 in = $1、Sonnet 4.6 の 100万 out = $15 → 合計 $16 × 150 円
    const jpy = sumCostJpy([
      { model: AI_MODEL_HAIKU, tokensIn: 1_000_000, tokensOut: 0 },
      { model: AI_MODEL_SONNET, tokensIn: 0, tokensOut: 1_000_000 },
    ]);
    expect(Number(jpy)).toBeCloseTo(16 * 150, 2);
  });

  it('全 turn が同一モデルなら estimateCostJpy と一致する', () => {
    const parts = [
      { model: AI_MODEL_SONNET, tokensIn: 40_000, tokensOut: 2_000 },
      { model: AI_MODEL_SONNET, tokensIn: 25_000, tokensOut: 3_000 },
    ];
    expect(sumCostJpy(parts)).toBe(estimateCostJpy(AI_MODEL_SONNET, 65_000, 5_000));
  });

  it('Haiku 化で実費が下がることを数値で確認する(2026-08-30 実測トークン)', () => {
    const allSonnet = estimateCostJpy(AI_MODEL_SONNET, 70_145, 5_578);
    const mixed = sumCostJpy([
      { model: AI_MODEL_HAIKU, tokensIn: 44_383, tokensOut: 2_068 },
      { model: AI_MODEL_SONNET, tokensIn: 25_762, tokensOut: 3_510 },
    ]);
    expect(Number(mixed)).toBeLessThan(Number(allSonnet));
  });

  it('空配列は 0 円', () => {
    expect(Number(sumCostJpy([]))).toBe(0);
  });
});
