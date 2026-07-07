import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';

import { ClerkAuthGuard } from '../../auth/clerk-auth.guard';
import { CurrentWorkspace } from '../../auth/current-workspace.decorator';
import { ADMIN_ROLES, Roles } from '../../auth/roles';
import { WorkspaceGuard } from '../../auth/workspace.guard';
import { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceAccess } from '../../workspaces/membership.service';
import { TwitterAuthService } from './twitter-auth.service';
import { TwitterClientService } from './twitter-client.service';

/**
 * Twitter (X) アカウント連携 API(ADR-014 §3)。
 *
 * - GET authorize    : OAuth 開始(OWNER / ADMIN のみ)。X の認可 URL を JSON で返す
 * - GET (list)       : 連携アカウント一覧(テナントメンバーなら誰でも、token は返さない)
 * - DELETE :accountId: 切断(OWNER / ADMIN)。X 側 revoke + ローカル DB 削除
 *
 * 注:OAuth callback ルートは `/webhooks/twitter/callback` で `WebhooksController` 側に置く。
 * 認証は state 検証で代替するため、callback には `ClerkAuthGuard` を付けない。
 */
@Controller('workspaces/:slug/integrations/twitter')
@UseGuards(ClerkAuthGuard)
export class IntegrationsTwitterController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly twitterAuth: TwitterAuthService,
    private readonly twitterClient: TwitterClientService,
  ) {}

  /**
   * GET /workspaces/:slug/integrations/twitter/authorize
   * X の認可 URL を生成して JSON で返す。呼び出し側(Server Action)が `redirect(url)` する設計。
   * Clerk 認証 + WorkspaceGuard を通った後、ADMIN_ROLES のみ実行可能。
   *
   * 302 リダイレクトを返さない理由:ブラウザからの `<a href>` 直接遷移では Authorization ヘッダーが
   * 送られず 401 になる。Server Action 経由で Bearer JWT を付けて叩き、レスポンスの URL を
   * FE 側で `redirect()` する方式(BFF プロキシパターン)に統一(ADR-014 §API 設計 の余地に記載)。
   */
  @Get('authorize')
  @UseGuards(WorkspaceGuard)
  @Roles(...ADMIN_ROLES)
  async authorize(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('slug') slug: string,
  ): Promise<{ url: string }> {
    // `WorkspaceAccess` に slug が含まれないため URL から `@Param('slug')` で取得する。
    // `WorkspaceGuard` は URL の `:slug` から tenant を解決して `ws.tenantId` をセットしているので、
    // ここで取り出す `slug` は guard が認可済みの tenant の slug と必ず一致する。
    // 内部 User.id(`TwitterAccount.connectedById` 保存用)は guard 解決済みの `ws.userId` を使う。
    const url = await this.twitterAuth.buildAuthorizeUrl({
      tenantId: ws.tenantId,
      userId: ws.userId,
      returnSlug: slug,
    });
    return { url };
  }

  /**
   * GET /workspaces/:slug/integrations/twitter
   * テナントに紐づく連携アカウント一覧(token は返さず、表示用 metadata のみ)。
   */
  @Get()
  @UseGuards(WorkspaceGuard)
  async list(@CurrentWorkspace() ws: WorkspaceAccess) {
    const accounts = await this.prisma.twitterAccount.findMany({
      where: { tenantId: ws.tenantId },
      select: {
        id: true,
        handle: true,
        xUserId: true,
        connectedById: true,
        expiresAt: true,
        createdAt: true,
        scopes: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return { accounts };
  }

  /**
   * DELETE /workspaces/:slug/integrations/twitter/:accountId
   * 連携を切断する(OWNER / ADMIN)。X 側 revoke は best-effort、ローカル DB 削除は確実に実行。
   * 既に存在しない場合は冪等に { ok: true } を返す。
   */
  @Delete(':accountId')
  @UseGuards(WorkspaceGuard)
  @Roles(...ADMIN_ROLES)
  async disconnect(
    @CurrentWorkspace() ws: WorkspaceAccess,
    @Param('accountId') accountId: string,
  ): Promise<{ ok: true }> {
    const account = await this.prisma.twitterAccount.findFirst({
      where: { id: accountId, tenantId: ws.tenantId },
    });
    if (!account) {
      return { ok: true };
    }
    await this.twitterClient.revoke(account);
    // `deleteMany` で record not found(別 ADMIN が同時に削除した場合の P2025)を握り潰し、
    // 0 件削除でも 200 を返す冪等な挙動にする(2 度押し / race condition 両方に強い)。
    await this.prisma.twitterAccount.deleteMany({
      where: { id: account.id, tenantId: ws.tenantId },
    });
    return { ok: true };
  }
}
