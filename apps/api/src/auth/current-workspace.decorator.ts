import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { WorkspaceAccess } from '../workspaces/membership.service';
import './workspace.guard';

/**
 * `WorkspaceGuard` が解決してリクエストに載せた「現在のユーザーの当該ワークスペースへのアクセス情報」
 * (`tenantId` / `name` / `plan` / `role` / `userId`)を取り出すパラメータデコレータ。
 *
 * 使い方: `@Get() handler(@CurrentWorkspace() ws: WorkspaceAccess) { ... }`
 * ※ `@UseGuards(ClerkAuthGuard, WorkspaceGuard)` と併用すること。
 */
export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WorkspaceAccess => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.workspaceAccess) {
      throw new Error(
        'CurrentWorkspace used without WorkspaceGuard. Add @UseGuards(ClerkAuthGuard, WorkspaceGuard).',
      );
    }
    return req.workspaceAccess;
  },
);
