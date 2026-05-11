import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import type { Request } from 'express';

import './auth-user';

/**
 * `Authorization: Bearer <Clerk session JWT>` を検証する Guard。
 * 検証成功時は `request.user = { clerkUserId }` をセットし、@CurrentUser() で取得できる。
 *
 * 使い方: `@UseGuards(ClerkAuthGuard)` をコントローラ or ハンドラに付ける。
 * Day 6 以降のデータ API でも再利用する。
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }
    const token = authHeader.slice('Bearer '.length);

    try {
      const payload = await verifyToken(token, {
        secretKey: this.config.getOrThrow<string>('CLERK_SECRET_KEY'),
      });
      req.user = { clerkUserId: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid session token');
    }
  }
}
