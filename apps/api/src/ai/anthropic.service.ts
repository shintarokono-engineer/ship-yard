import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

import { AI_MAX_RETRIES, ANTHROPIC_REQUEST_TIMEOUT_MS } from './ai.constants';

/**
 * Anthropic Claude API クライアントのラッパー(ADR-005)。
 * シークレットキー(`ANTHROPIC_API_KEY`)で初期化。実呼び出しは `client.messages.create(...)` 等。
 *
 * モデルの使い分け(Sonnet / Haiku)とコスト単価は `ai.constants.ts` を参照。
 * AI 呼び出しは必ず `AIUsageService.record(...)` でテナント単位に記録すること(課金・上限判定の根拠、ADR-005)。
 */
@Injectable()
export class AnthropicService {
  /** Claude API クライアント本体。Service から `anthropic.client.messages.create(...)` のように使う。 */
  readonly client: Anthropic;

  constructor(private readonly config: ConfigService) {
    // 【Anthropic SDK 初期化】Claude REST API への HTTP クライアント。
    // timeout / maxRetries を明示し、プロバイダ障害時に同期ハンドラが張り付くのを防ぐ。
    this.client = new Anthropic({
      apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
      timeout: ANTHROPIC_REQUEST_TIMEOUT_MS,
      maxRetries: AI_MAX_RETRIES,
    });
  }
}
