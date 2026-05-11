import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthUser } from './auth-user';
import './auth-user';

/**
 * ClerkAuthGuard が検証してリクエストに載せた認証ユーザーを取り出すパラメータデコレータ。
 *
 * 使い方: `@Get() handler(@CurrentUser() user: AuthUser) { ... }`
 * ※ ClerkAuthGuard を通っていない場合は undefined になるので、必ず @UseGuards と併用する。
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new Error('CurrentUser used without ClerkAuthGuard. Add @UseGuards(ClerkAuthGuard).');
    }
    return req.user;
  },
);
