import { Controller, Param, Post, UseGuards } from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PublicCheckClaimService, type PublicCheckClaimResult } from './public-check-claim.service';

/**
 * `/check` の結果を登録済みアカウントへ持ち越す API(ADR-015)。**認証必須**。
 *
 * guard を持たない `PublicCheckController` に混ぜない(未認証でテナントを作れる経路ができる)。
 * `WorkspaceGuard` は付けない。引き換え時点ではまだワークスペースが無く、これが作るため。
 */
@Controller('idea-checks')
@UseGuards(ClerkAuthGuard)
export class PublicCheckClaimController {
  constructor(private readonly claimService: PublicCheckClaimService) {}

  /**
   * POST /idea-checks/:id/claim
   *
   * - 結果が存在しない → 404 / 他人が引き換え済み → 409
   * - 本人が引き換え済み(再読み込み)→ 200 + `alreadyClaimed: true`
   * - クレジット不足で診断を起動できない → 200 + `jobId: null`(**失敗にしない**)
   */
  @Post(':id/claim')
  claim(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<PublicCheckClaimResult> {
    return this.claimService.claim(user.clerkUserId, id);
  }
}
