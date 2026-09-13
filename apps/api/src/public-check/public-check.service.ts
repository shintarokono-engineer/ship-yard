import { createHmac, randomBytes } from 'node:crypto';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Prisma, PublicIdeaCheck } from '@shipyard/db';

import { AI_MODEL_HAIKU } from '../ai/shared/ai.constants';
import { translateAIProviderError } from '../ai/shared/ai-error';
import { estimateCostJpy } from '../ai/shared/ai-usage.service';
import { AnthropicService } from '../ai/shared/anthropic.service';
import { extractToolUseBlock } from '../ai/shared/tool-use';
import { dayjs } from '../common/time';
import {
  parsePublicCheckOutput,
  SUBMIT_PUBLIC_CHECK_TOOL,
} from '../idea-validation/validation-schema';
import { PrismaService } from '../prisma/prisma.service';
import {
  PUBLIC_CHECK_DAILY_LIMIT,
  PUBLIC_CHECK_ID_BYTES,
  PUBLIC_CHECK_IP_RATE_LIMIT,
  PUBLIC_CHECK_IP_RATE_WINDOW_MINUTES,
  PUBLIC_CHECK_MAX_TOKENS,
  PUBLIC_CHECK_TEMPERATURE,
} from './public-check.constants';
import { PublicCheckDailyLimitError, PublicCheckIpRateLimitError } from './public-check.errors';
import { buildPublicCheckUserPrompt, PUBLIC_CHECK_SYSTEM_PROMPT } from './public-check.prompt';

/**
 * 無料公開アイデア検証 `/check` の Service(ADR-015)。
 *
 * 有料版と違い、認証もテナントも無く、Haiku 1 ターンで同期実行する(実測 14.8〜21.1 秒)。
 * テナントが無いので `AIUsage` には記録せず、実費は `PublicIdeaCheck` の tokens / costJpy に持つ。
 */
@Injectable()
export class PublicCheckService {
  private readonly logger = new Logger(PublicCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 公開診断を 1 件実行する。
   *
   * **IP レート制限を日次上限より先に置くこと。**逆にすると、弾かれるリクエストが日次枠を
   * 減らし、単一の発信元がその日の枠を実行せずに空にできてしまう。
   */
  async run(input: { ideaText: string; clientIp: string | null }): Promise<PublicIdeaCheck> {
    const ipHash = this.hashIp(input.clientIp);
    await this.assertWithinIpRateLimit(ipHash);
    await this.consumeDailyQuota();

    try {
      const res = await this.anthropic.client.messages.create({
        model: AI_MODEL_HAIKU,
        max_tokens: PUBLIC_CHECK_MAX_TOKENS,
        temperature: PUBLIC_CHECK_TEMPERATURE,
        system: PUBLIC_CHECK_SYSTEM_PROMPT,
        tools: [SUBMIT_PUBLIC_CHECK_TOOL],
        tool_choice: { type: 'tool', name: SUBMIT_PUBLIC_CHECK_TOOL.name },
        messages: [{ role: 'user', content: buildPublicCheckUserPrompt(input.ideaText) }],
      });

      const output = parsePublicCheckOutput(extractToolUseBlock(res, 'PUBLIC_CHECK').input);

      return await this.prisma.publicIdeaCheck.create({
        data: {
          id: randomBytes(PUBLIC_CHECK_ID_BYTES).toString('base64url'),
          ideaText: input.ideaText,
          // 内部値 0〜60 のまま保存する。100 点への正規化は表示層でのみ行う(ADR-015)。
          totalScore: output.totalScore,
          breakdown: output.breakdown as unknown as Prisma.InputJsonValue,
          suggestions: output.suggestions as unknown as Prisma.InputJsonValue,
          tokensIn: res.usage.input_tokens,
          tokensOut: res.usage.output_tokens,
          // 定数を直書きせず応答の model を使う(モデルを変えたときに単価を直し忘れないため)。
          costJpy: estimateCostJpy(res.model, res.usage.input_tokens, res.usage.output_tokens),
          ipHash,
        },
      });
    } catch (err) {
      // 日次枠は戻さない。失敗しても AI のコストは発生しており、
      // 失敗を繰り返すことで天井を素通りできてはいけない。
      throw translateAIProviderError(err, 'PUBLIC_CHECK', this.logger);
    }
  }

  /** 結果を 1 件取得する。ID は推測不能値なので、これを知っていること自体が閲覧権限になる。 */
  async getById(id: string): Promise<PublicIdeaCheck> {
    const check = await this.prisma.publicIdeaCheck.findUnique({ where: { id } });
    if (!check) {
      throw new NotFoundException('診断結果が見つかりません。');
    }
    return check;
  }

  /**
   * 結果を共有状態にする(opt-in)。既に共有済みなら時刻を更新しない。
   *
   * `sharedAt` は保持期間の判定にも使う(共有済みは purge の対象外)。
   */
  async share(id: string): Promise<PublicIdeaCheck> {
    await this.prisma.publicIdeaCheck.updateMany({
      where: { id, sharedAt: null },
      data: { sharedAt: new Date() },
    });
    return this.getById(id);
  }

  /**
   * 日次グローバル上限を 1 消費する(**費用の天井の主防御**)。
   *
   * `PublicIdeaCheck` の件数で数えないのは、失敗した実行がレコードを残さないため
   * (失敗を繰り返せば天井が破れる)。
   */
  private async consumeDailyQuota(): Promise<void> {
    // `AIUsage` の月次上限判定が UTC 月なのに合わせ、日の境界も UTC で取る。
    const date = dayjs.utc().startOf('day').toDate();

    // `update: {}` は no-op。既存行があれば何もしない。
    await this.prisma.publicCheckUsage.upsert({
      where: { date },
      create: { date, count: 0 },
      update: {},
    });

    // `UPDATE ... SET count = count + 1 WHERE date = ? AND count < ?` の 1 文になる。
    // 行ロックで直列化されるため、並行リクエストがあっても上限を超えて加算されない。
    const updated = await this.prisma.publicCheckUsage.updateMany({
      where: { date, count: { lt: PUBLIC_CHECK_DAILY_LIMIT } },
      data: { count: { increment: 1 } },
    });
    if (updated.count === 0) {
      this.logger.warn(
        `PUBLIC_CHECK_DAILY_LIMIT_REACHED date=${dayjs(date).format('YYYY-MM-DD')} limit=${PUBLIC_CHECK_DAILY_LIMIT}`,
      );
      throw new PublicCheckDailyLimitError();
    }
  }

  /**
   * 同一 IP ハッシュからの実行回数を制限する(**補助層**)。
   *
   * `ipHash` が取れない場合(ヘッダ未指定 / ソルト未設定)は素通しし、日次上限に委ねる。
   */
  private async assertWithinIpRateLimit(ipHash: string | null): Promise<void> {
    if (!ipHash) return;
    const since = dayjs.utc().subtract(PUBLIC_CHECK_IP_RATE_WINDOW_MINUTES, 'minute').toDate();
    const recent = await this.prisma.publicIdeaCheck.count({
      where: { ipHash, createdAt: { gte: since } },
    });
    if (recent >= PUBLIC_CHECK_IP_RATE_LIMIT) {
      throw new PublicCheckIpRateLimitError();
    }
  }

  /**
   * クライアント IP をハッシュ化する。**生 IP は保存しない。**
   *
   * ソルト付きなのは、素の SHA-256 だと IPv4 の空間が狭く総当たりで逆引きできるため。
   * ソルト未設定時は `null` を返して素通しする(fail open)。ここは認証の境界ではなく、
   * 主防御の日次上限は独立して効いているため。気付けるように error でログを残す。
   */
  private hashIp(ip: string | null): string | null {
    if (!ip) return null;
    const salt = this.config.get<string>('PUBLIC_CHECK_IP_SALT');
    if (!salt) {
      this.logger.error(
        'PUBLIC_CHECK_IP_SALT is not set; per-IP rate limiting is disabled (daily global limit still applies)',
      );
      return null;
    }
    return createHmac('sha256', salt).update(ip).digest('hex');
  }
}
