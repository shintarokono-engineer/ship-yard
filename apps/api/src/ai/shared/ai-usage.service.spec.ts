import { Feature } from '@shipyard/db';

import { AI_MODEL_HAIKU, AI_MODEL_SONNET, EMBEDDING_MODEL } from './ai.constants';
import { creditsForUsage, estimateCostJpy } from './ai-usage.service';

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

  it('turnCount で乗算する(2-step 診断は 3cr × 2 = 6cr)', () => {
    expect(creditsForUsage(AI_MODEL_SONNET, Feature.PRODUCT_DIAGNOSIS, 2)).toBe(6);
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
