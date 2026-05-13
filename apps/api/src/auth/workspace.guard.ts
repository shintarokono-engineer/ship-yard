import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { Role } from '@shipyard/db';

import { MembershipService } from '../workspaces/membership.service';
import './auth-user';
import { ROLES_KEY } from './roles';

/**
 * `workspaces/:slug/...` 配下のルートに付ける Guard。前段の `ClerkAuthGuard` で認証済みである前提で:
 *  1. URL の `:slug` と Clerk ユーザー ID から `MembershipService.resolveAccess` で所属を解決(未所属 / slug 不在は 404)
 *  2. ハンドラ/コントローラに `@Roles(...)` があれば、`access.role` がそれに含まれるか検証(含まれなければ 403)
 *  3. 解決した `access` を `request.workspaceAccess` に載せる(`Request` 拡張は `./auth-user.ts`、ハンドラは `@CurrentWorkspace()` で取得)
 *
 * 使い方: `@UseGuards(ClerkAuthGuard, WorkspaceGuard)`(順序が重要 — `ClerkAuthGuard` が先で `request.user` をセットする)。
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly membership: MembershipService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();

    const clerkUserId = req.user?.clerkUserId;
    if (!clerkUserId) {
      // ClerkAuthGuard を先に通していれば来ないはず(`@UseGuards` の指定漏れ = プログラミングエラー)。
      throw new Error('WorkspaceGuard requires ClerkAuthGuard to run first.');
    }
    // Express 5 の型上 params の値は string | string[]。`:slug` は通常パラメータなので string のはず。
    const slugParam = req.params.slug;
    const slug = typeof slugParam === 'string' ? slugParam : undefined;
    if (!slug) {
      throw new Error('WorkspaceGuard applied to a route without a (string) :slug parameter.');
    }

    const access = await this.membership.resolveAccess(slug, clerkUserId);
    if (!access) {
      // 未所属 / slug 不在を区別せず 404(存在の有無を漏らさない、ADR-003)。
      throw new NotFoundException();
    }

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (allowed && allowed.length > 0 && !allowed.includes(access.role)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action in this workspace',
      );
    }

    req.workspaceAccess = access;
    return true;
  }
}
