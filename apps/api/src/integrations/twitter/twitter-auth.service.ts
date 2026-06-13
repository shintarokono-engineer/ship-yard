import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

import {
  TWITTER_AUTH_STATE_TTL_SECONDS,
  TWITTER_AUTHORIZE_URL,
  TWITTER_OAUTH_STATE_KEY_PREFIX,
  TWITTER_SCOPES,
  TWITTER_TOKEN_URL,
  TWITTER_USER_ME_URL,
} from './twitter.constants';

/**
 * Upstash Redis に保存する OAuth state ペイロード。
 * `consumeState` の戻り値の型でもあるため、WebhooksController など callback 側でも参照される(export)。
 */
export interface OauthStatePayload {
  /** PKCE code_verifier(authorize 時に生成、callback 時に code と一緒に token endpoint へ送る) */
  verifier: string;
  /** 連携先テナント(tenant.id)。callback で TwitterAccount.upsert の where に使う */
  tenantId: string;
  /** 連携実行者(user.id、TwitterAccount.connectedById に保存して監査用) */
  userId: string;
  /** callback 完了後に返す画面用 slug(設定画面の URL 組み立てに使う) */
  returnSlug: string;
}

interface TwitterTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

interface TwitterUserResponse {
  data: { id: string; username: string };
}

/**
 * Twitter OAuth 2.0 PKCE フロー(ADR-014 §4)を司るサービス。
 *
 * - state + code_verifier を Upstash Redis に保存(5 分 TTL)
 * - callback で state を検証 → DEL(使い捨て、replay 防止)
 * - code を access_token に交換し、暗号化前の raw token + user info を返す
 *
 * 暗号化と DB upsert は呼び出し側(WebhooksController / IntegrationsTwitterController)で実施。
 * 本サービスは X とのプロトコル責務に集中する。
 */
@Injectable()
export class TwitterAuthService {
  private readonly logger = new Logger(TwitterAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  /**
   * env 未設定時は null。利用時に `requireRedis` 経由で 503 を投げる(Day 49 Clerk Webhook と同じ運用)。
   * これにより、Twitter 機能を使わない環境でも API server は起動できる。
   */
  private readonly redis: Redis | null;

  constructor(config: ConfigService) {
    const clientId = config.get<string>('TWITTER_CLIENT_ID');
    const clientSecret = config.get<string>('TWITTER_CLIENT_SECRET');
    const redirectUri = config.get<string>('TWITTER_REDIRECT_URI');
    const redisUrl = config.get<string>('UPSTASH_REDIS_REST_URL');
    const redisToken = config.get<string>('UPSTASH_REDIS_REST_TOKEN');

    this.clientId = clientId ?? '';
    this.clientSecret = clientSecret ?? '';
    this.redirectUri = redirectUri ?? '';

    if (clientId && clientSecret && redirectUri && redisUrl && redisToken) {
      this.redis = new Redis({ url: redisUrl, token: redisToken });
    } else {
      this.redis = null;
      this.logger.warn(
        'Twitter integration disabled: TWITTER_CLIENT_ID / SECRET / REDIRECT_URI / UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN のいずれかが未設定です。' +
          ' /workspaces/:slug/integrations/twitter/* と /webhooks/twitter/callback は 503 を返します。',
      );
    }
  }

  /**
   * Twitter 連携設定の有無を検査し、未設定なら 503 を投げる(Day 49 Clerk Webhook と整合)。
   * 戻り値で Redis を渡すことで、呼び出し側は `this.redis` の null 判定を都度書かなくて済む。
   */
  private requireRedis(): Redis {
    if (!this.redis) {
      throw new ServiceUnavailableException(
        'X 連携機能は現在利用できません(運用者へお問い合わせください)。',
      );
    }
    return this.redis;
  }

  /**
   * state + PKCE を生成して Redis に保存し、X 認可 URL を組み立てて返す。
   * 呼び出し側は返却 URL に 302 リダイレクトするだけでよい。
   */
  async buildAuthorizeUrl(args: {
    tenantId: string;
    userId: string;
    returnSlug: string;
  }): Promise<string> {
    const redis = this.requireRedis();
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(64).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const payload: OauthStatePayload = {
      verifier,
      tenantId: args.tenantId,
      userId: args.userId,
      returnSlug: args.returnSlug,
    };
    await redis.set(`${TWITTER_OAUTH_STATE_KEY_PREFIX}${state}`, JSON.stringify(payload), {
      ex: TWITTER_AUTH_STATE_TTL_SECONDS,
    });

    const url = new URL(TWITTER_AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', TWITTER_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  /**
   * callback の state を検証して PKCE verifier を含む payload を取り出す。
   * Upstash の `GETDEL` で「取得 + 削除」 を atomic に実行することで使い捨てを担保し、
   * 同時 callback 到達時のリプレイを理論的にも完全に排除する。
   * 不在 = 期限切れ or リプレイ → 400(ユーザー向け文言を返す)。
   *
   * 戻り値:Upstash の `getdel<T>` は値が JSON object として保存されていた場合は自動 parse して T を返し、
   * string として保存されていた場合は string を返す。本実装は `set` 時に `JSON.stringify` で string 化
   * しているため、戻り値も string で来る前提で `JSON.parse` する。
   */
  async consumeState(state: string): Promise<OauthStatePayload> {
    const redis = this.requireRedis();
    const key = `${TWITTER_OAUTH_STATE_KEY_PREFIX}${state}`;
    const raw = await redis.getdel<string | OauthStatePayload>(key);
    if (!raw) {
      throw new BadRequestException('リンクが無効か期限切れです。再度連携をお試しください。');
    }
    return typeof raw === 'string' ? (JSON.parse(raw) as OauthStatePayload) : raw;
  }

  /**
   * code + verifier を access_token / refresh_token に交換する。
   * 必須 scope(`tweet.write` / `offline.access`)が欠けている場合はユーザーに再連携を促す。
   */
  async exchangeCode(args: { code: string; verifier: string }): Promise<TwitterTokenResponse> {
    this.requireRedis(); // env 未設定なら 503(redis を直接は使わないが、connection 完全性の門番)
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: this.redirectUri,
      code_verifier: args.verifier,
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
      // X のエラーレスポンス本文はサーバ側ログのみに残す。レート制限や IP block で長文が来る可能性に
      // 備えて先頭 200 字に切り詰める(code / verifier の echo はないため機微情報は含まれない想定)。
      const text = (await res.text()).slice(0, 200);
      this.logger.warn(`Twitter token exchange failed: ${res.status} ${text}`);
      throw new BadRequestException('Twitter からトークンを取得できませんでした。');
    }
    const json = (await res.json()) as TwitterTokenResponse;
    if (!json.scope?.includes('tweet.write') || !json.scope?.includes('offline.access')) {
      throw new BadRequestException(
        '必要な権限が付与されていません(tweet.write / offline.access)。再度連携を試してください。',
      );
    }
    return json;
  }

  /** access_token を使って自ユーザー情報(X 側 user id と @handle)を取得する。 */
  async fetchSelf(accessToken: string): Promise<{ xUserId: string; handle: string }> {
    const res = await fetch(TWITTER_USER_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new BadRequestException('Twitter ユーザー情報を取得できませんでした。');
    }
    const json = (await res.json()) as TwitterUserResponse;
    return { xUserId: json.data.id, handle: json.data.username };
  }
}
