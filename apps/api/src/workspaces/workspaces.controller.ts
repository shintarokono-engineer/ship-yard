import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { Role } from '@shipyard/db';

import type { AuthUser } from '../auth/auth-user';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { Roles } from '../auth/roles';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { BillingService } from '../billing/billing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import type { WorkspaceAccess } from './membership.service';
import { WorkspacesService } from './workspaces.service';

/**
 * ワークスペース(テナント)の作成 / 参照 / 課金操作 API。
 *
 * Guard 戦略は **method 単位**(class-level は `ClerkAuthGuard` のみ):
 * - `POST /workspaces`(新規作成):認証のみ — まだ workspace 所属がないので `WorkspaceGuard` は付けない
 * - `GET /workspaces/:slug`:`WorkspaceGuard`(所属確認、ADR-003)
 * - `POST /workspaces/:slug/checkout-session`:`WorkspaceGuard` + `@Roles(Role.OWNER)`(ADR-004 / Role 定義)
 *
 */
@Controller('workspaces')
@UseGuards(ClerkAuthGuard)
export class WorkspacesController {
  constructor(
    private readonly billing: BillingService,
    private readonly workspaces: WorkspacesService,
  ) {}

  /**
   * GET /workspaces — 現在ユーザーが所属するワークスペース一覧。
   * - 認証のみ(`WorkspaceGuard` なし、slug を持たない)
   * - User 行未同期の場合は空配列(オンボーディング前提のため 403 にしない)
   * - 並び順は `TenantMember.joinedAt` 昇順(最初の所属が先頭)
   */
  @Get()
  listMine(@CurrentUser() user: AuthUser) {
    return this.workspaces.listMine(user.clerkUserId);
  }

  /**
   * POST /workspaces — ワークスペース(テナント)新規作成。
   * 認証済みユーザーなら誰でも作成可(1 ユーザー = 何個でも所有可、MVP は制限なし)。
   * - User 未登録(Clerk Webhook 未同期等) → 403
   * - slug 指定が既存と衝突 → 409
   * - 入力検証エラー(name 長さ / slug 形式) → 400
   * - 成功時は `{ tenant: { id, slug, name, plan, role }, subscriptionInitialized }` を返す。
   *   `subscriptionInitialized: false` は Stripe Customer 作成失敗(Stripe ダウン等)、Checkout 時に lazy 作成される
   */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.clerkUserId, dto);
  }

  /**
   * GET /workspaces/:slug
   * - slug が存在しない / 現在のユーザーが TenantMember でない → 404(`WorkspaceGuard`、ADR-003)
   * - 所属している → { id, slug, name, plan, role }
   */
  @Get(':slug')
  @UseGuards(WorkspaceGuard)
  getWorkspace(@CurrentWorkspace() ws: WorkspaceAccess, @Param('slug') slug: string) {
    return {
      id: ws.tenantId,
      slug,
      name: ws.name,
      plan: ws.plan,
      role: ws.role,
    };
  }

  /**
   * POST /workspaces/:slug/checkout-session
   * 指定プラン(PRO / TEAM)の Stripe Checkout Session を作り、リダイレクト先 URL を返す。
   * - 未所属 / slug 不在 → 404
   * - OWNER 以外 → 403(`@Roles(Role.OWNER)`、ADR-004 / Role 定義)
   * - plan が PRO / TEAM 以外 → 400(`CreateCheckoutSessionDto`)
   */
  @Post(':slug/checkout-session')
  @UseGuards(WorkspaceGuard)
  @Roles(Role.OWNER)
  createCheckoutSession(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('slug') slug: string,
    @Body() dto: CreateCheckoutSessionDto,
  ): Promise<{ url: string }> {
    return this.billing.createCheckoutSession({
      tenantId: ws.tenantId,
      slug,
      name: ws.name,
      plan: dto.plan,
    });
  }

  /**
   * GET /workspaces/:slug/billing
   * Billing 画面用の Subscription 詳細(plan / status / currentPeriodEnd / canceledAt)を返す。
   * - 未所属 / slug 不在 → 404
   * - OWNER 以外 → 403(`@Roles(Role.OWNER)`、課金関連は OWNER 権限のみ)
   */
  @Get(':slug/billing')
  @UseGuards(WorkspaceGuard)
  @Roles(Role.OWNER)
  getBilling(@CurrentWorkspace() ws: WorkspaceAccess) {
    return this.billing.getBillingDetail({ tenantId: ws.tenantId, planFallback: ws.plan });
  }

  /**
   * POST /workspaces/:slug/portal-session
   * Stripe Customer Portal Session を作成し、リダイレクト先 URL を返す(支払い方法 / 請求書履歴 /
   * プラン変更 / 解約を Stripe 側 UI で完結)。
   * - 未所属 / slug 不在 → 404
   * - OWNER 以外 → 403(`@Roles(Role.OWNER)`、課金関連は OWNER 権限のみ)
   * - Stripe Dashboard で Customer Portal が未設定の場合 → 500(Stripe API のエラーが伝播)
   */
  @Post(':slug/portal-session')
  @UseGuards(WorkspaceGuard)
  @Roles(Role.OWNER)
  createPortalSession(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('slug') slug: string,
  ): Promise<{ url: string }> {
    return this.billing.createPortalSession({
      tenantId: ws.tenantId,
      slug,
      name: ws.name,
    });
  }
}
