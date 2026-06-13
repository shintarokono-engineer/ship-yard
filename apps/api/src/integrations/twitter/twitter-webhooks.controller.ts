import { BadRequestException, Controller, Get, Query, Redirect } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPrismaError, PrismaErrorCode } from '@shipyard/db';

import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';

import { TwitterAuthService } from './twitter-auth.service';
import { TWITTER_SCOPES } from './twitter.constants';

/**
 * Twitter (X) OAuth 2.0 PKCE callback 専用 Controller(ADR-014 §4)。
 *
 * URL prefix は `/webhooks/twitter` で、`WebhooksController` の `/webhooks/stripe` / `/webhooks/clerk` と
 * 同じ「外部サービスからのコールバック受け」 系列に並ぶ。`WebhooksController` への DI 集約を避けるため
 * 独立した Controller として `IntegrationsTwitterModule` に登録する。
 *
 * 認証は state(Redis 5 分 TTL)で代替するため `ClerkAuthGuard` を付けない(`WebhooksController` の
 * Stripe / Clerk と同じスタンス)。
 */
@Controller('webhooks/twitter')
export class TwitterWebhooksController {
  private readonly appBaseUrl: string;

  constructor(
    private readonly twitterAuth: TwitterAuthService,
    private readonly prisma: PrismaService,
    private readonly crypto: TokenEncryptionService,
    config: ConfigService,
  ) {
    this.appBaseUrl = config.getOrThrow<string>('APP_BASE_URL');
  }

  /**
   * GET /webhooks/twitter/callback
   *
   * - state を検証 → PKCE verifier を取り出し(`consumeState` で使い捨て、GETDEL で atomic)
   * - code を access_token / refresh_token に交換(scope 検証付き)
   * - `users/me` で xUserId + handle を取得
   * - `TwitterAccount.upsert`(`@@unique([tenantId, xUserId])`)で保存
   * - 別テナントが同じ xUserId を既に連携済み = P2002 を catch して `?error=twitter_already_connected` で誘導
   *
   * 成功 / 失敗いずれも設定画面(`/w/{slug}/settings/integrations`)に 302 で戻す。
   */
  @Get('callback')
  @Redirect()
  async callback(
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
  ): Promise<{ url: string; statusCode: number }> {
    // X 側の不正なコールバック(state / code 欠落)は state 検証以前に弾く。
    // 「リンクが無効か期限切れ」 ではない明確な不整合と分離するため早期 400。
    if (!state || !code) {
      throw new BadRequestException('state / code パラメータが不足しています。');
    }

    const payload = await this.twitterAuth.consumeState(state);
    const tokens = await this.twitterAuth.exchangeCode({ code, verifier: payload.verifier });
    const self = await this.twitterAuth.fetchSelf(tokens.access_token);

    // upsert の create / update で重複する 6 フィールドは共通 variable に括る。
    const commonFields = {
      connectedById: payload.userId,
      handle: self.handle,
      accessToken: this.crypto.encrypt(tokens.access_token),
      refreshToken: this.crypto.encrypt(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: [...TWITTER_SCOPES],
    };

    try {
      await this.prisma.twitterAccount.upsert({
        where: {
          tenantId_xUserId: { tenantId: payload.tenantId, xUserId: self.xUserId },
        },
        create: {
          ...commonFields,
          tenantId: payload.tenantId,
          xUserId: self.xUserId,
        },
        update: commonFields,
      });
    } catch (err) {
      // 同一 xUserId が別テナントで連携済みの場合のみ unique 違反(P2002)を握って画面誘導。
      // それ以外は再 throw して 500 にし、運用が気付ける形にする。
      if (isPrismaError(err, PrismaErrorCode.UNIQUE_VIOLATION)) {
        return {
          url: `${this.appBaseUrl}/w/${payload.returnSlug}/settings/integrations?error=twitter_already_connected`,
          statusCode: 302,
        };
      }
      throw err;
    }
    return {
      url: `${this.appBaseUrl}/w/${payload.returnSlug}/settings/integrations?connected=twitter`,
      statusCode: 302,
    };
  }
}
