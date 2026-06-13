import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TwitterAccount } from '@shipyard/db';

import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TWITTER_REVOKE_URL,
  TWITTER_TOKEN_REFRESH_BUFFER_SECONDS,
  TWITTER_TOKEN_URL,
  TWITTER_TWEETS_URL,
} from './twitter.constants';

interface TwitterTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** postTweet 成功時の戻り値(X 側で発行された tweet id を保持)。 */
export interface PostTweetResult {
  tweetId: string;
}

/**
 * Twitter API 失敗時のエラー分類(ADR-014 §6)。
 * Service 層が catch して Delivery.error の文言を出し分ける用途で使う。
 *
 * - `TOKEN_EXPIRED`: refresh も失敗、再連携が必要
 * - `SUSPENDED`: アカウント凍結 / 権限不足
 * - `RATE_LIMIT`: 429、`retryAfterSeconds` があれば文言に反映
 * - `SERVER`: 5xx 等の一時障害
 * - `NETWORK`: fetch 自体が throw
 * - `UNKNOWN`: 想定外
 */
export class TwitterApiError extends Error {
  constructor(
    public readonly kind: 'TOKEN_EXPIRED' | 'SUSPENDED' | 'RATE_LIMIT' | 'SERVER' | 'NETWORK' | 'UNKNOWN',
    public readonly userMessage: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(userMessage);
    this.name = 'TwitterApiError';
  }
}

/**
 * Twitter API v2 クライアント(ADR-014 §4)。
 *
 * - `getValidAccessToken`: expiresAt の 5 分前 buffer で自動 refresh + DB 更新
 * - `postTweet`: `POST /2/tweets`、失敗は HTTP status に応じて `TwitterApiError` に分類
 * - `revoke`: 切断時に best-effort で `POST /2/oauth2/revoke`(失敗してもローカル DB 削除は呼び出し側で実行)
 */
@Injectable()
export class TwitterClientService {
  private readonly logger = new Logger(TwitterClientService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  /**
   * env 未設定でも boot させる(Day 49 Clerk Webhook と同じ運用)。
   * 各 public method 冒頭で `requireConfigured` を呼び、未設定なら 503 を返す。
   */
  private readonly isConfigured: boolean;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: TokenEncryptionService,
  ) {
    this.clientId = config.get<string>('TWITTER_CLIENT_ID') ?? '';
    this.clientSecret = config.get<string>('TWITTER_CLIENT_SECRET') ?? '';
    this.isConfigured = Boolean(this.clientId && this.clientSecret);
    if (!this.isConfigured) {
      this.logger.warn(
        'TwitterClientService disabled: TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET のいずれかが未設定です。',
      );
    }
  }

  /** Twitter 連携の env 設定確認。未設定なら 503(Day 49 Clerk Webhook と整合)。 */
  private requireConfigured(): void {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'X 連携機能は現在利用できません(運用者へお問い合わせください)。',
      );
    }
  }

  /**
   * 有効な access_token を返す。expiresAt まで残り 5 分以下なら refresh + DB 更新を行う。
   * 戻り値は復号済みの平文 token。
   *
   * TODO(v1.x):**並列 refresh の race condition** に注意。同テナントから複数 `postTweet` が並列に
   * 走った場合、両方が同時に expiresAt 判定を抜けて同じ古い refresh_token で X token endpoint を
   * 叩く可能性がある。X の refresh_token はワンタイムのため 2 回目は 4xx で失敗する。MVP では
   * Delivery 実行が 1 件ずつのため実害が限定的だが、v1.x で BullMQ 投入時に PostgreSQL advisory
   * lock(`pg_advisory_xact_lock`)や Redis SETNX(tenant 単位)で直列化する。
   */
  async getValidAccessToken(account: TwitterAccount): Promise<string> {
    this.requireConfigured();
    if (account.expiresAt.getTime() - Date.now() > TWITTER_TOKEN_REFRESH_BUFFER_SECONDS * 1000) {
      return this.crypto.decrypt(account.accessToken);
    }
    const refreshToken = this.crypto.decrypt(account.refreshToken);
    const refreshed = await this.refresh(refreshToken);
    await this.prisma.twitterAccount.update({
      where: { id: account.id },
      data: {
        accessToken: this.crypto.encrypt(refreshed.access_token),
        refreshToken: this.crypto.encrypt(refreshed.refresh_token),
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
    return refreshed.access_token;
  }

  /** refresh_token grant で新しい access_token を取得する。失敗時は TOKEN_EXPIRED で再連携を促す。 */
  private async refresh(refreshToken: string): Promise<TwitterTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
    });
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(TWITTER_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Twitter token refresh failed: ${res.status} ${text}`);
      throw new TwitterApiError(
        'TOKEN_EXPIRED',
        'X の認証情報が失効しました。設定画面から再連携してください。',
      );
    }
    return (await res.json()) as TwitterTokenResponse;
  }

  /**
   * Tweet を投稿する。失敗時は HTTP status に応じて `TwitterApiError` を throw。
   * Service 層で catch して Delivery.error に保存する想定。
   *
   * fetch 自体が throw する場合(DNS 失敗 / TCP リセット / offline)は `'NETWORK'` 種別の
   * `TwitterApiError` でラップする。Service 層では一律 `instanceof TwitterApiError` で扱えるよう統一。
   */
  async postTweet(account: TwitterAccount, text: string): Promise<PostTweetResult> {
    // getValidAccessToken 内で requireConfigured が呼ばれる(env 未設定なら 503)。
    const token = await this.getValidAccessToken(account);

    let res: Response;
    try {
      res = await fetch(TWITTER_TWEETS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      this.logger.warn(`Twitter post network failure: ${(err as Error).message}`);
      throw new TwitterApiError(
        'NETWORK',
        'X への接続に失敗しました。ネットワーク状況を確認して再実行してください。',
      );
    }

    if (res.status === 401) {
      throw new TwitterApiError(
        'TOKEN_EXPIRED',
        'X の認証情報が失効しました。設定画面から再連携してください。',
      );
    }
    if (res.status === 403) {
      throw new TwitterApiError('SUSPENDED', 'X アカウントが利用制限を受けています。');
    }
    if (res.status === 429) {
      const retryAfter = Number.parseInt(res.headers.get('retry-after') ?? '0', 10);
      throw new TwitterApiError(
        'RATE_LIMIT',
        `X 投稿の上限に達しました。${retryAfter > 0 ? `${retryAfter} 秒後に` : 'しばらくしてから'}再実行してください。`,
        retryAfter,
      );
    }
    if (!res.ok) {
      // 5xx 系の原因(メンテ / payload バリデーション / 内部障害)を識別するため body も含めて warn 出力。
      // X が返す JSON が長くなることを想定して先頭 200 字に切り詰める。
      const responseBody = (await res.text()).slice(0, 200);
      this.logger.warn(`Twitter post failed: ${res.status} ${responseBody}`);
      throw new TwitterApiError('SERVER', 'X 側で一時的な障害が発生しています。再実行してください。');
    }
    const json = (await res.json()) as { data: { id: string } };
    return { tweetId: json.data.id };
  }

  /**
   * X 側で access_token を revoke する(best-effort)。
   * 失敗してもローカル DB 削除はする想定なので、例外は握り潰して warn ログのみ出す。
   */
  async revoke(account: TwitterAccount): Promise<void> {
    if (!this.isConfigured) {
      // best-effort 設計のため、env 未設定なら静かに skip(controller 側のローカル DB 削除は別途確実に走る)。
      this.logger.warn('Skipping Twitter revoke: client not configured');
      return;
    }
    try {
      const token = this.crypto.decrypt(account.accessToken);
      const body = new URLSearchParams({ token, client_id: this.clientId });
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      await fetch(TWITTER_REVOKE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body,
      });
    } catch (err) {
      this.logger.warn(`Twitter revoke failed (best-effort): ${(err as Error).message}`);
    }
  }
}
