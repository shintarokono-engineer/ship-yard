import { HttpException, HttpStatus } from '@nestjs/common';

/** 費用の天井に到達したことを表すレスポンスコード。FE はこれで文言を出し分ける。 */
export const PUBLIC_CHECK_ERROR_CODE = {
  /** 日次グローバル上限に到達。その日は誰も実行できない。 */
  DAILY_LIMIT_REACHED: 'PUBLIC_CHECK_DAILY_LIMIT_REACHED',
  /** 同一発信元からの実行が多すぎる。時間をおけば再開できる。 */
  IP_RATE_LIMITED: 'PUBLIC_CHECK_IP_RATE_LIMITED',
} as const;

/** 日次グローバル上限に到達した(主防御)。翌日には成功しうるので 429。 */
export class PublicCheckDailyLimitError extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: PUBLIC_CHECK_ERROR_CODE.DAILY_LIMIT_REACHED,
        message: '本日の無料診断の枠は終了しました。',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** 同一 IP ハッシュからの実行が窓あたりの上限を超えた(補助層)。 */
export class PublicCheckIpRateLimitError extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: PUBLIC_CHECK_ERROR_CODE.IP_RATE_LIMITED,
        message: '短時間に実行しすぎです。しばらく待ってから再度お試しください。',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
