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

/** `AIUsageService.record` の引数。1 回の AI 呼び出しを集計テーブルに記録するための情報。 */
export interface RecordAIUsageInput {
  tenantId: string;
  userId: string;
  model: string;
  feature: Feature;
  tokensIn: number;
  tokensOut: number;
}

/** `AIUsageService.getMonthlySummary` の戻り値。設定画面の「利用状況」タブ用。 */
export interface MonthlyUsageSummary {
  plan: Plan;
  /** 集計対象期間の起点(当月 1 日 00:00 UTC、ISO8601 文字列)。 */
  periodStart: string;
  /** 当月のユーザー視点の AI 利用回数(`Feature.OTHER` を除外、Free 上限カウントと一致)。 */
  used: number;
  /** FREE プランの月次上限。PRO / TEAM は無制限のため null。 */
  limit: number | null;
  /** feature 別の内訳(`OTHER` を含む全件、count 降順)。 */
  byFeature: { feature: Feature; count: number }[];
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

  /**
   * 当月のテナント単位 AI 利用状況を集計する(設定画面の「利用状況」タブ用)。
   *
   * `used` は `assertWithinFreeQuota` と同じく `Feature.OTHER`(裏方 embedding / RAG 検索)を
   * 除外し、ユーザー視点の「月 N 回」と一致させる。`byFeature` は内訳表示用に `OTHER` も含める。
   */
  async getMonthlySummary(tenant: { id: string; plan: Plan }): Promise<MonthlyUsageSummary> {
    const periodStart = startOfMonthUtc();
    const grouped = await this.prisma.aIUsage.groupBy({
      by: ['feature'],
      where: { tenantId: tenant.id, createdAt: { gte: periodStart } },
      _count: { _all: true },
    });
    const byFeature = grouped
      .map((g) => ({ feature: g.feature, count: g._count._all }))
      .sort((a, b) => b.count - a.count);
    const used = byFeature
      .filter((f) => f.feature !== Feature.OTHER)
      .reduce((sum, f) => sum + f.count, 0);
    return {
      plan: tenant.plan,
      periodStart: periodStart.toISOString(),
      used,
      limit: tenant.plan === Plan.FREE ? FREE_MONTHLY_AI_LIMIT : null,
      byFeature,
    };
  }

  /** AI 呼び出し 1 回分をテナント単位で記録する。 */
  async record(usage: RecordAIUsageInput): Promise<void> {
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
