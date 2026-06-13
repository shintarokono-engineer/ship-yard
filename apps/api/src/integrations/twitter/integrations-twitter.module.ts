import { Module } from '@nestjs/common';

import { MembershipService } from '../../workspaces/membership.service';
import { IntegrationsTwitterController } from './integrations-twitter.controller';
import { TwitterAuthService } from './twitter-auth.service';
import { TwitterClientService } from './twitter-client.service';
import { TwitterWebhooksController } from './twitter-webhooks.controller';

/**
 * Twitter (X) 連携モジュール(ADR-014 §3 / §4)。
 *
 * - `TwitterAuthService` / `TwitterClientService` を export し、AnnouncementService(配信実行)
 *   等の他モジュールから利用可能にする。
 * - `TwitterWebhooksController` は OAuth callback(`/webhooks/twitter/callback`)を受ける専用 Controller。
 *   `WebhooksController` への DI 集約を避けるため当モジュール内に分離して保持する。
 * - `MembershipService` は `WorkspaceGuard` が DI 要求するため provider に含める
 *   (CryptoModule / PrismaModule が Global なので追加 imports は不要)。
 */
@Module({
  controllers: [IntegrationsTwitterController, TwitterWebhooksController],
  providers: [TwitterAuthService, TwitterClientService, MembershipService],
  exports: [TwitterAuthService, TwitterClientService],
})
export class IntegrationsTwitterModule {}
