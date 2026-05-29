import { Global, Module } from '@nestjs/common';

import { TokenEncryptionService } from './token-encryption.service';

/**
 * Global Module。他のモジュールから import 不要で `TokenEncryptionService` を DI 可能(ADR-014)。
 * Twitter token 暗号化など、複数モジュールから横断的に呼ばれる暗号化処理を集約する。
 */
@Global()
@Module({
  providers: [TokenEncryptionService],
  exports: [TokenEncryptionService],
})
export class CryptoModule {}
