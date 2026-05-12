import { Global, Module } from '@nestjs/common';

import { AnthropicService } from './anthropic.service';

/**
 * Anthropic Claude クライアント(AnthropicService)をアプリ全体で利用可能にするグローバル Module(ADR-005)。
 */
@Global()
@Module({
  providers: [AnthropicService],
  exports: [AnthropicService],
})
export class AnthropicModule {}
