import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';

import type { PublicIdeaCheck } from '@shipyard/db';

import { CreatePublicCheckDto } from './dto/create-public-check.dto';
import { PublicCheckService } from './public-check.service';

/**
 * クライアント IP を伝えるヘッダ名。Web 側が `x-forwarded-for` から詰め替える。
 *
 * 送信元は常に Vercel なので、詰め替えないと全リクエストが同一 IP 扱いになる。
 * **偽装できる**ため IP 制限は補助でしかなく、主防御は日次グローバル上限に置いている。
 */
export const PUBLIC_CHECK_CLIENT_IP_HEADER = 'x-client-ip';

/** API が返す公開診断結果。内部だけで使う列(`ipHash` 等)は含めない。 */
interface PublicCheckResponse {
  id: string;
  ideaText: string;
  /** **内部値 0〜60**(3 軸 × 20 点)。100 点への正規化は FE の表示層で行う。 */
  totalScore: number;
  breakdown: unknown;
  suggestions: unknown;
  /** opt-in 共有済みか。`sharedAt` の時刻自体は画面に出さないので真偽値だけ返す。 */
  shared: boolean;
  /** 既に登録へ引き換え済みか。結果ページの導線を出し分けるために使う。 */
  claimed: boolean;
  createdAt: Date;
}

function toResponse(check: PublicIdeaCheck): PublicCheckResponse {
  return {
    id: check.id,
    ideaText: check.ideaText,
    totalScore: check.totalScore,
    breakdown: check.breakdown,
    suggestions: check.suggestions,
    shared: check.sharedAt !== null,
    claimed: check.claimedAt !== null,
    createdAt: check.createdAt,
  };
}

/**
 * 未認証で叩ける公開アイデア検証 API(ADR-015)。
 *
 * guard を持たない別 controller に分ける方針は `PublicLandingPageController` と同じ。
 * 費用の天井は `PublicCheckService` 側で AI 呼び出しの前に効かせている。
 */
@Controller('public/idea-checks')
export class PublicCheckController {
  constructor(private readonly publicCheck: PublicCheckService) {}

  /**
   * POST /public/idea-checks(未認証可)
   *
   * アイデア文を採点して結果を返す(同期実行)。
   * 上限到達時は 429 + `code` を返し、FE 側で文言を出し分ける。
   */
  @Post()
  async create(
    @Body() dto: CreatePublicCheckDto,
    @Headers(PUBLIC_CHECK_CLIENT_IP_HEADER) clientIp?: string,
  ): Promise<PublicCheckResponse> {
    const check = await this.publicCheck.run({
      ideaText: dto.ideaText,
      clientIp: clientIp?.trim() || null,
    });
    return toResponse(check);
  }

  /** GET /public/idea-checks/:id(未認証可)。ID を知っていることが閲覧権限になる。 */
  @Get(':id')
  async get(@Param('id') id: string): Promise<PublicCheckResponse> {
    return toResponse(await this.publicCheck.getById(id));
  }

  /** POST /public/idea-checks/:id/share(未認証可)。共有後も結果ページは `noindex` のまま。 */
  @Post(':id/share')
  async share(@Param('id') id: string): Promise<PublicCheckResponse> {
    return toResponse(await this.publicCheck.share(id));
  }
}
