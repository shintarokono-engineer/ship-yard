import { BadGatewayException, Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * AI プロバイダ(Anthropic / OpenAI)からの応答が期待形式ではなかった、
 * またはプロバイダ側の障害で処理が完結しなかったことを表す例外(Day 16、Bad Gateway = 502)。
 *
 * **なぜ 502 か(500 ではなく)**: AI プロバイダは Neorie の上流依存であり、
 * 上流依存の問題で処理が完結しない場合は意味論的に 502 Bad Gateway が正しい。
 * 500 だと「Neorie 側のコードのバグ」と区別がつかず、運用上の切り分けが困難になる。
 *
 * **使い分け**:
 * - Tool_use ブロック欠落・空 content・JSON スキーマ不一致 等の **不正レスポンス** → 本クラスを `throw`
 * - SDK 例外(レート制限・ネットワーク不通 等)を捕まえて 502 化したいときも本クラス(原因は `cause` に格納)
 * - **握りつぶし方針(EmbeddingService / RagSearchService)はそのまま維持**(主処理を守る Day 12/13 設計、本クラスには変えない)
 *
 * 例外メッセージはユーザーに露出するため、機能名や原因(Claude / OpenAI / 何のフィールドが欠けたか)を
 * 含めると運用時の切り分けが楽になる。
 */
export class AIBadResponseError extends BadGatewayException {
  constructor(message: string, options?: { cause?: unknown }) {
    // HttpException 標準フォーマット(NestJS 9+)に揃える。super 経由で渡すことで
    // stack trace への cause 反映や、Sentry 等の error reporter の標準連携が効く。
    super(message, { cause: options?.cause });
  }
}

/**
 * AI プロバイダの **アカウント設定不備**(クレジット残高切れ / API キー失効・不正)を表す例外
 * (Service Unavailable = 503)。
 *
 * **なぜ 502 ではなく 503 か**: 502 はプロバイダ側の一時的な障害を指すが、こちらは
 * **こちらの運用ミス**であり、ユーザーがリトライしても永久に回復しない。503 は
 * 「今は使えないが、こちらの対応で回復する」を意味するため意味論的に正しい。
 *
 * **なぜ専用クラスが要るか**: 2026-08-04 に本番で Anthropic のクレジットが枯渇し、
 * LP 生成が `HTTP 500` + 「ランディングページの生成に失敗しました」とだけ表示された。
 * 500 は「Neorie 側のコードのバグ」を意味するので切り分けを誤らせるうえ、ユーザーには
 * 自分の操作が悪いのか障害なのか判断できず、無駄なリトライを繰り返させる。
 *
 * **監視**: メッセージに含まれる `AI_PROVIDER_ACCOUNT_ERROR` を CloudWatch Logs の
 * メトリクスフィルタで拾い、SNS(`shipyard-prod-alerts`)へ通知する(`infra/prod/monitoring.tf`)。
 * アプリから直接 SNS を publish しない理由は、インスタンスロールへの IAM 追加が要るうえ、
 * 障害時に通知経路自体が失敗しうるため。ログ経由なら経路が独立する。
 */
export class AIProviderAccountError extends ServiceUnavailableException {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
  }
}

/** レート制限(429)に当たったことを表す例外。時間をおけば回復するのでユーザーにその旨を伝える。 */
export class AIRateLimitError extends ServiceUnavailableException {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
  }
}

/** SDK 例外から HTTP ステータスを取り出す(Anthropic / OpenAI とも `status` を持つ)。 */
function statusOf(err: unknown): number | undefined {
  return typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
    ? (err as { status: number }).status
    : undefined;
}

/** 残高切れ・キー不正を示す文言か。プロバイダはこれらを 400/401/403 で返すため本文で判別する。 */
function isAccountProblem(err: unknown, status: number | undefined): boolean {
  if (status === 401 || status === 403) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /credit balance is too low|insufficient_quota|billing|exceeded your current quota|invalid[_ ]api[_ ]key/i.test(
    msg,
  );
}

/**
 * AI プロバイダの SDK 例外を、ユーザーに出せるメッセージを持つ HTTP 例外へ翻訳する。
 *
 * 翻訳しない場合、SDK 例外は NestJS の既定フィルタで **500 + 汎用文言**になり、
 * 「こちらの設定不備」なのか「コードのバグ」なのか運用時に切り分けられない。
 *
 * すでに HttpException(`AIBadResponseError` 等)なら素通しする。
 */
export function translateAIProviderError(err: unknown, feature: string, logger?: Logger): unknown {
  // NestJS の HttpException は status を持つが、SDK 例外と区別するためコンストラクタ名で判定しない。
  // getStatus を持つのは HttpException だけなので、それを目印にする。
  if (typeof (err as { getStatus?: unknown })?.getStatus === 'function') return err;

  const status = statusOf(err);
  if (status === undefined) return err;

  if (isAccountProblem(err, status)) {
    // このマーカー文字列をメトリクスフィルタが拾う。変更する場合は monitoring.tf も同時に直すこと。
    logger?.error(
      `AI_PROVIDER_ACCOUNT_ERROR feature=${feature} status=${status} ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return new AIProviderAccountError(
      'AI 機能が一時的に利用できません。復旧まで少しお待ちください(運営側で対応中です)。',
      { cause: err },
    );
  }

  if (status === 429) {
    return new AIRateLimitError(
      'AI の利用が混み合っています。少し時間をおいてからお試しください。',
      { cause: err },
    );
  }

  if (status >= 500) {
    return new AIBadResponseError(
      'AI サービスで問題が発生しました。時間をおいてからお試しください。',
      { cause: err },
    );
  }

  return err;
}
