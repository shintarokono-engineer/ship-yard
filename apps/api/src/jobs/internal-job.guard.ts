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

import { INTERNAL_JOB_TOKEN_HEADER } from './jobs.constants';

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
    if (!expected) {
      this.logger.error(
        'INTERNAL_JOB_TOKEN is not set; POST /internal/jobs/* will respond 500 until configured',
      );
      throw new InternalServerErrorException('Internal job endpoint is not configured');
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    const provided = req.headers[INTERNAL_JOB_TOKEN_HEADER];
    if (typeof provided !== 'string' || !constantTimeEquals(provided, expected)) {
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
