import { createHash, timingSafeEqual } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { INTERNAL_JOB_TOKEN_HEADER, SECRET_PLACEHOLDER } from './jobs.constants';

/**
 * 内部ジョブエンドポイント(`/internal/jobs/*`)の認証 Guard。
 *
 * EventBridge の API destination Connection は API_KEY 認証(ヘッダ名 + 値)しか扱えないため、
 * 共有シークレットをヘッダで受け取って検証する。
 *
 * **env 未設定でもアプリ起動は止めない**:`CLERK_WEBHOOK_SECRET` のプレースホルダで本番の
 * bootstrap ごと落ちた事故(webhooks.controller.ts のコメント参照)を踏まえ、
 * 「未設定ならこのエンドポイントだけ 500」に倒す。
 */
@Injectable()
export class InternalJobGuard implements CanActivate {
  private readonly logger = new Logger(InternalJobGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>('INTERNAL_JOB_TOKEN');
    if (!expected || expected === SECRET_PLACEHOLDER) {
      // Terraform は Secrets Manager(secrets.tf)と EventBridge Connection(scheduler.tf)の
      // 両方を `REPLACE_ME` で作成する。運用者が両方の手動投入を忘れると、期待値と
      // ヘッダ値が両方とも `REPLACE_ME` のまま一致し、認証を素通りしてしまう
      // (かつ推測可能な資格情報で公開エンドポイントが開くことにもなる)。
      // プレースホルダのままの状態を「未設定」と同じ扱いにして 500 に倒すことで、
      // FailedInvocations アラームで当日中に気付けるようにする。
      this.logger.error(
        'INTERNAL_JOB_TOKEN is not set or is still the Terraform placeholder; ' +
          'POST /internal/jobs/* will respond 500 until configured',
      );
      throw new InternalServerErrorException('Internal job endpoint is not configured');
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    const provided = req.headers[INTERNAL_JOB_TOKEN_HEADER];
    if (typeof provided !== 'string' || !constantTimeEquals(provided, expected)) {
      // このエンドポイントは日次 1 回しか叩かれない cron 呼び出しなので、1 回の 401 が
      // その日のバッチ全体の欠落に直結する(EventBridge 側のシークレット回し忘れ等)。
      // 値そのものはログに出さず、ヘッダ未指定か値不一致かのみを区別して記録する。
      this.logger.warn(
        `Rejected /internal/jobs/* request: ${
          typeof provided === 'string' ? 'token mismatch' : 'missing token header'
        }`,
      );
      throw new UnauthorizedException('Invalid internal job token');
    }
    return true;
  }
}

/**
 * タイミング攻撃に強い文字列比較。
 * `timingSafeEqual` は同一長のバッファを要求するため、いったん SHA-256 に通して長さを揃える
 * (長さの違いで早期 return すると、その分岐自体が情報を漏らすため)。
 */
function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
