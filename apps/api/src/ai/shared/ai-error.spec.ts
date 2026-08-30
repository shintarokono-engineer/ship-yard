import { BadRequestException, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  AIBadResponseError,
  AIProviderAccountError,
  AIRateLimitError,
  translateAIProviderError,
} from './ai-error';

/** Anthropic / OpenAI の SDK 例外を模す(いずれも `status` と message を持つ)。 */
function sdkError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

describe('translateAIProviderError', () => {
  describe('アカウント設定不備 → 503 + マーカーログ', () => {
    it('Anthropic のクレジット枯渇を検知する(2026-08-04 の本番障害の再現)', () => {
      const logger = { error: vi.fn() } as unknown as Logger;
      const err = sdkError(
        400,
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
      );

      const out = translateAIProviderError(err, 'LP_GEN', logger);

      expect(out).toBeInstanceOf(AIProviderAccountError);
      expect((out as AIProviderAccountError).getStatus()).toBe(503);
      // 原因(運営側の設定不備)をユーザーに露出せず、かつリトライを促さない文言であること
      expect((out as AIProviderAccountError).message).toContain('一時的に利用できません');
      expect((out as AIProviderAccountError).message).not.toContain('credit');
    });

    it('OpenAI の quota 超過を検知する', () => {
      const out = translateAIProviderError(
        sdkError(
          429,
          'You exceeded your current quota, please check your plan and billing details',
        ),
        'EMBEDDING',
      );
      expect(out).toBeInstanceOf(AIProviderAccountError);
    });

    it('401 / 403(キー失効)を status だけで検知する', () => {
      expect(translateAIProviderError(sdkError(401, 'Unauthorized'), 'X')).toBeInstanceOf(
        AIProviderAccountError,
      );
      expect(translateAIProviderError(sdkError(403, 'Forbidden'), 'X')).toBeInstanceOf(
        AIProviderAccountError,
      );
    });

    it('監視用マーカーと feature 名をログに出す(CloudWatch のメトリクスフィルタが拾う)', () => {
      const logger = { error: vi.fn() } as unknown as Logger;
      translateAIProviderError(sdkError(401, 'Unauthorized'), 'PRODUCT_DIAGNOSIS', logger);

      expect(logger.error).toHaveBeenCalledTimes(1);
      const msg = vi.mocked(logger.error).mock.calls[0]?.[0] as string;
      // infra/prod/monitoring.tf の pattern と一致していること
      expect(msg).toContain('AI_PROVIDER_ACCOUNT_ERROR');
      expect(msg).toContain('feature=PRODUCT_DIAGNOSIS');
    });
  });

  describe('その他のステータス', () => {
    it('429(単なるレート制限)は時間をおけば回復する旨を伝える', () => {
      const out = translateAIProviderError(sdkError(429, 'Rate limit exceeded'), 'X');
      expect(out).toBeInstanceOf(AIRateLimitError);
      expect((out as AIRateLimitError).message).toContain('時間をおいて');
    });

    it('5xx はプロバイダ側障害として 502 にする', () => {
      const out = translateAIProviderError(sdkError(503, 'Overloaded'), 'X');
      expect(out).toBeInstanceOf(AIBadResponseError);
      expect((out as AIBadResponseError).getStatus()).toBe(502);
    });
  });

  describe('翻訳しないもの', () => {
    it('既に HttpException なら素通しする(二重翻訳を防ぐ)', () => {
      const original = new AIBadResponseError('tool_use ブロックがありません');
      expect(translateAIProviderError(original, 'X')).toBe(original);

      const bad = new BadRequestException('入力が不正です');
      expect(translateAIProviderError(bad, 'X')).toBe(bad);
    });

    it('status を持たない例外(DB エラー等)は素通しする', () => {
      const err = new Error('P2002: Unique constraint failed');
      expect(translateAIProviderError(err, 'X')).toBe(err);
    });

    it('400 でも残高と無関係なら素通しする(プロンプト長超過など)', () => {
      const err = sdkError(400, 'prompt is too long: 250000 tokens > 200000 maximum');
      expect(translateAIProviderError(err, 'X')).toBe(err);
    });
  });
});
