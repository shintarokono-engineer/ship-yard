import { Controller, Get, UseGuards } from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceAccess } from '../workspaces/membership.service';
import { AIUsageService } from './ai-usage.service';

/**
 * テナント単位の AI 利用状況 API(設定画面の「利用状況」タブ用、Day 29)。
 *
 * 認証 → 所属解決は `ClerkAuthGuard` → `WorkspaceGuard` が担う。閲覧のみなので `@Roles` は付けず
 * 全テナントメンバーが参照可能(課金・上限の透明性をメンバー全員に見せる方針)。
 */
@Controller('workspaces/:slug/usage')
@UseGuards(ClerkAuthGuard, WorkspaceGuard)
export class UsageController {
  constructor(private readonly aiUsage: AIUsageService) {}

  /**
   * GET /workspaces/:slug/usage
   * - 未所属 / slug 不在 → 404(`WorkspaceGuard`)
   * - 当月の AI 利用回数(`Feature.OTHER` 除外)+ FREE 上限 + feature 別内訳を返す
   */
  @Get()
  getUsage(@CurrentWorkspace() ws: WorkspaceAccess) {
    return this.aiUsage.getMonthlySummary({ id: ws.tenantId, plan: ws.plan });
  }
}
