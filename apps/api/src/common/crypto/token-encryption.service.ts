import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推奨 96bit
const TAG_LENGTH = 16; // GCM 認証タグ 128bit
const KEY_LENGTH = 32; // AES-256 = 256bit

/**
 * Twitter access_token / refresh_token を AES-256-GCM で暗号化・復号する(ADR-014)。
 *
 * 暗号化結果のフォーマット:base64url(iv || tag || ciphertext)
 * - 先頭 12B = IV(`randomBytes` で毎回ランダム)
 * - 次 16B = 認証タグ(GCM の AEAD)
 * - 残り = 暗号文
 *
 * master key の運用は env `TWITTER_TOKEN_ENCRYPTION_KEY`(base64-encoded 32 バイト)。
 *   - local:`apps/api/.env.local`(`.gitignore` 済)
 *   - staging / prod:AWS Secrets Manager 経由で env 注入
 *   - 生成:`openssl rand -base64 32`
 *
 * 鍵ローテーション(v1.x):新 key で再暗号化バッチを実装予定。MVP では単一 key 運用。
 */
@Injectable()
export class TokenEncryptionService {
  private readonly masterKey: Buffer;

  constructor(configService: ConfigService) {
    const keyBase64 = configService.getOrThrow<string>('TWITTER_TOKEN_ENCRYPTION_KEY');
    this.masterKey = Buffer.from(keyBase64, 'base64');
    if (this.masterKey.length !== KEY_LENGTH) {
      throw new Error('TWITTER_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
  }

  decrypt(encrypted: string): string {
    const buf = Buffer.from(encrypted, 'base64url');
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
