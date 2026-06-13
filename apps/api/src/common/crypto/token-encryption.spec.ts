import type { ConfigService } from '@nestjs/config';

import { TokenEncryptionService } from './token-encryption.service';

/** 32 バイトのテスト用マスター key(0x01 を 32 個並べた buffer の base64)。 */
const VALID_KEY_BASE64 = Buffer.alloc(32, 1).toString('base64');

function makeConfig(keyBase64: string): ConfigService {
  return {
    getOrThrow: () => keyBase64,
  } as unknown as ConfigService;
}

describe('TokenEncryptionService', () => {
  let service: TokenEncryptionService;

  beforeEach(() => {
    service = new TokenEncryptionService(makeConfig(VALID_KEY_BASE64));
  });

  it('encrypt → decrypt の往復で元の平文に戻る', () => {
    const plaintext = 'test-access-token-abc-日本語混在';
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('同じ平文でも IV がランダムで結果が毎回違う', () => {
    const enc1 = service.encrypt('same-input');
    const enc2 = service.encrypt('same-input');
    expect(enc1).not.toBe(enc2);
  });

  it('改ざんされた暗号文を decrypt すると例外', () => {
    const encrypted = service.encrypt('payload');
    const tampered = encrypted.slice(0, -2) + 'AA';
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('master key が 32 バイトでなければ constructor で例外', () => {
    const shortKey = Buffer.alloc(16).toString('base64'); // 16 バイト
    expect(() => new TokenEncryptionService(makeConfig(shortKey))).toThrow(
      'TWITTER_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)',
    );
  });
});
