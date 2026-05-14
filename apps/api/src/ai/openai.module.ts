import { Global, Module } from '@nestjs/common';

import { OpenAIService } from './openai.service';

/**
 * OpenAI クライアント(`OpenAIService`、embedding 専用)をアプリ全体で利用可能にするグローバル Module(ADR-005)。
 */
@Global()
@Module({
  providers: [OpenAIService],
  exports: [OpenAIService],
})
export class OpenAIModule {}
