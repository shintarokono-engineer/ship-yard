import { ForbiddenException, Injectable } from '@nestjs/common';

import { Feature, Plan } from '@shipyard/db';

import { dayjs } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import {
  FALLBACK_PRICING_USD_PER_MTOK,
  FREE_MONTHLY_AI_LIMIT,
  MODEL_PRICING_USD_PER_MTOK,
  USD_PER_JPY,
} from './ai.constants';

/** トークン数からおおよその円コストを見積もる(`AIUsage.costJpy` は Decimal(10,4))。 */
function estimateCostJpy(model: string, tokensIn: number, tokensOut: number): string {
  const p = MODEL_PRICING_USD_PER_MTOK[model] ?? FALLBACK_PRICING_USD_PER_MTOK;
  const usd = (tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out;
  return (usd * USD_PER_JPY).toFixed(4);
}

/** 当月の 1 日 00:00(UTC)。`AIUsage` の月次集計の基準。 */
function startOfMonthUtc(): Date {
  return dayjs.utc().startOf('month').toDate();
}

/**
 * AI 呼び出しのテナント単位ログ(`AIUsage`)の記録と、Free プランの月次上限チェック(ADR-005)。
 *
 * - すべての AI 呼び出しは成功後に `record(...)` する(課金・上限判定の根拠なので取りこぼし禁止)
 * - 呼び出す前に `assertWithinFreeQuota(...)` で当月の上限を確認する(超過なら 403)
 *
 * tenantId は明示的に受け取る(Checkout 同様、ALS のテナントコンテキストには依存しない)。
 */
@Injectable()
export class AIUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * FREE プランのテナントが当月 `FREE_MONTHLY_AI_LIMIT` 回未満かを検証。FREE 以外は無制限。超過なら 403。
   *
   * カウントは `Feature.OTHER`(embedding / RAG 検索など、ユーザーが明示的に呼んだ AI 機能ではないもの)を除外。
   * これがないと 1 回の generate につき検索 embedding と本生成で 2 件積まれ、Free 上限が実質半分になる。
   * 「20 回 = ユーザー視点の AI 機能を 20 回呼べる」というユーザー体験と一致させる。
   */
  async assertWithinFreeQuota(tenant: { id: string; plan: Plan }): Promise<void> {
    if (tenant.plan !== Plan.FREE) return;
    const used = await this.prisma.aIUsage.count({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: startOfMonthUtc() },
        feature: { not: Feature.OTHER },
      },
    });
    if (used >= FREE_MONTHLY_AI_LIMIT) {
      throw new ForbiddenException(
        `Free プランの AI 利用上限(月 ${FREE_MONTHLY_AI_LIMIT} 回)に達しました。Pro へのアップグレードが必要です。`,
      );
    }
  }

  /** AI 呼び出し 1 回分をテナント単位で記録する。 */
  async record(usage: {
    tenantId: string;
    userId: string;
    model: string;
    feature: Feature;
    tokensIn: number;
    tokensOut: number;
  }): Promise<void> {
    await this.prisma.aIUsage.create({
      data: {
        tenantId: usage.tenantId,
        userId: usage.userId,
        model: usage.model,
        feature: usage.feature,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costJpy: estimateCostJpy(usage.model, usage.tokensIn, usage.tokensOut),
      },
    });
  }
}
