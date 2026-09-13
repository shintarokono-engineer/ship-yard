import { Injectable, Logger } from '@nestjs/common';

import { dayjs } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import {
  PUBLIC_CHECK_IP_HASH_RETENTION_HOURS,
  PUBLIC_CHECK_RETENTION_DAYS,
} from './public-check.constants';

/** purge の実行結果。EventBridge のログから効いているか追えるように件数を返す。 */
export interface PublicCheckPurgeResult {
  /** 削除した診断結果の件数。 */
  deleted: number;
  /** `ipHash` を null にした件数。 */
  ipHashCleared: number;
}

/**
 * 公開診断結果の保持期間バッチ(ADR-015)。
 *
 * 未共有のものだけを削除する(共有済みを消すと、貼られた URL が死ぬ)。
 */
@Injectable()
export class PublicCheckPurgeService {
  private readonly logger = new Logger(PublicCheckPurgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<PublicCheckPurgeResult> {
    const deleteBefore = dayjs.utc().subtract(PUBLIC_CHECK_RETENTION_DAYS, 'day').toDate();
    const ipHashBefore = dayjs
      .utc()
      .subtract(PUBLIC_CHECK_IP_HASH_RETENTION_HOURS, 'hour')
      .toDate();

    // 削除を先に実行する。逆にすると、これから消す行の ipHash を無駄に更新する。
    const deleted = await this.prisma.publicIdeaCheck.deleteMany({
      where: { sharedAt: null, createdAt: { lt: deleteBefore } },
    });

    const ipHashCleared = await this.prisma.publicIdeaCheck.updateMany({
      where: { ipHash: { not: null }, createdAt: { lt: ipHashBefore } },
      data: { ipHash: null },
    });

    const result = { deleted: deleted.count, ipHashCleared: ipHashCleared.count };
    this.logger.log(`public-check-purge finished: ${JSON.stringify(result)}`);
    return result;
  }
}
