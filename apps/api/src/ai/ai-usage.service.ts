import { ForbiddenException, Injectable, Logger } from '@nestjs/common';

import { Feature, Plan } from '@shipyard/db';

import { dayjs } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import {
  ANNOUNCEMENT_MAX_PER_MONTH_PRO,
  FALLBACK_MODEL_CREDITS,
  FALLBACK_PRICING_USD_PER_MTOK,
  FEATURE_CREDIT_OVERRIDES,
  IDEA_VALIDATION_MAX_PER_MONTH_PRO,
  MODEL_CREDITS,
  MODEL_PRICING_USD_PER_MTOK,
  PLAN_CREDIT_LIMITS,
  PRODUCT_DIAGNOSIS_MAX_PER_MONTH_PRO,
  TEAM_CREDITS_PER_SEAT,
  USD_PER_JPY,
} from './ai.constants';

/** トークン数からおおよその円コストを見積もる(`AIUsage.costJpy` は Decimal(10,4))。 */
function estimateCostJpy(model: string, tokensIn: number, tokensOut: number): string {
  const p = MODEL_PRICING_USD_PER_MTOK[model] ?? FALLBACK_PRICING_USD_PER_MTOK;
  const usd = (tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out;
  return (usd * USD_PER_JPY).toFixed(4);
}

/** ある AI 呼び出しが消費する AI クレジット数(ADR-012 / ADR-014)。
 * `Feature.OTHER`(裏方 embedding / RAG 検索など、ユーザー明示的でない機能)は cr 消費なし。
 * `FEATURE_CREDIT_OVERRIDES` に登録された Feature(Tool Use や Web Search で実コストが乖離するもの)は
 * そちらを優先し、未登録なら `MODEL_CREDITS[model]` をそのまま返す。
 *
 * `turnCount` は 1 つの機能で複数ターンの API call をした場合の合算値(デフォルト 1)。
 * 例:ADR-013 改訂版の IDEA_VALIDATION / PRODUCT_DIAGNOSIS は Day 47.5 で 2-step 化
 * (調査ターン + 採点ターン)したため `turnCount = 2`。ユーザー視点のクレジット消費を
 * 実 API call 回数と一致させ、サービス側の AI 原価とプラン上限判定を整合させるため。
 * override 値も同様に turnCount で乗算する(2-step 機能の override 設定時に意図通り)。
 */
function creditsForUsage(model: string, feature: Feature, turnCount = 1): number {
  if (feature === Feature.OTHER) return 0;
  const override = FEATURE_CREDIT_OVERRIDES[feature];
  if (override !== undefined) return override * turnCount;
  return (MODEL_CREDITS[model] ?? FALLBACK_MODEL_CREDITS) * turnCount;
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
  /**
   * 1 機能で複数ターンの API call をした場合のターン数(デフォルト 1)。
   * クレジット計算に効く(`credits = MODEL_CREDITS[model] * turnCount`)。
   * Day 47.5 で 2-step 化した IDEA_VALIDATION / PRODUCT_DIAGNOSIS は `2` を渡す。
   * `tokensIn` / `tokensOut` は呼び出し側で全ターン合算した値を渡すこと。
   */
  turnCount?: number;
}

/** `AIUsageService.getMonthlySummary` の戻り値。設定画面の「利用状況」タブ用。 */
export interface MonthlyUsageSummary {
  plan: Plan;
  /** 集計対象期間の起点(当月 1 日 00:00 UTC、ISO8601 文字列)。 */
  periodStart: string;
  /** 当月のユーザー視点の AI 利用回数(`Feature.OTHER` を除外、参考値)。 */
  used: number;
  /** 当月の AI クレジット消費量(ADR-012 のプラン上限判定の主軸)。 */
  usedCredits: number;
  /** プラン別の月次クレジット上限。FREE = 0(AI 停止)、PRO = 300、TEAM = seats × 800。 */
  limitCredits: number;
  /** feature 別の内訳(`OTHER` を含む全件、count 降順、各 feature の credits 合計も付与)。 */
  byFeature: { feature: Feature; count: number; credits: number }[];
}

/**
 * AI 呼び出しのテナント単位ログ(`AIUsage`)の記録と、プラン別月次クレジット上限の検証(ADR-005 / ADR-012)。
 *
 * - すべての AI 呼び出しは成功後に `record(...)` する(課金・上限判定の根拠なので取りこぼし禁止)
 * - 呼び出す前に `assertWithinPlanCredits(...)` で当月のクレジット上限を確認する(超過なら 403)
 *
 * tenantId は明示的に受け取る(Checkout 同様、ALS のテナントコンテキストには依存しない)。
 *
 * ADR-012 v1.0.1 で「Free 月 20 回」から「プラン別 AI クレジット制(Haiku=1 / Sonnet=3、
 * Pro 月 300 cr、Team 月 seats × 800 cr、Free は AI 停止)」に変更。
 */
@Injectable()
export class AIUsageService {
  private readonly logger = new Logger(AIUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * テナントの当月クレジット消費がプラン上限未満かを検証(ADR-012)。
   *
   * - FREE: 常に 403(トライアル終了後の AI 停止状態)
   * - PRO:  月 300 cr 未満なら通す
   * - TEAM: 月 quantity × 800 cr 未満なら通す(quantity は `Subscription.quantity` = Stripe ミラー)
   *
   * クレジットは `Feature.OTHER`(embedding / RAG 検索)を 0 cr とし、ユーザー視点で意味のある
   * 機能呼び出しのみを消費対象にする(ユーザーが見る「残り cr」と一致)。
   */
  async assertWithinPlanCredits(tenant: { id: string; plan: Plan }): Promise<void> {
    if (tenant.plan === Plan.FREE) {
      throw new ForbiddenException(
        'このワークスペースの AI 機能は停止中です。Pro / Team プランへアップグレードしてください。',
      );
    }
    const limit = await this.getPlanCreditLimit(tenant);
    const used = await this.getMonthlyCreditsUsed(tenant.id);
    if (used >= limit) {
      throw new ForbiddenException(
        `月次 AI クレジット上限(${limit})に達しました。来月の更新をお待ちください。`,
      );
    }
  }

  /**
   * 当月のテナント単位 AI 利用状況を集計する(設定画面の「利用状況」タブ用)。
   *
   * `used`(回数)は参考値、`usedCredits` / `limitCredits` がプラン上限判定の主軸(ADR-012)。
   * `byFeature` は内訳表示用に `OTHER` も含める(各 feature の credits 合計も付与)。
   */
  async getMonthlySummary(tenant: { id: string; plan: Plan }): Promise<MonthlyUsageSummary> {
    const periodStart = startOfMonthUtc();
    const grouped = await this.prisma.aIUsage.groupBy({
      by: ['feature'],
      where: { tenantId: tenant.id, createdAt: { gte: periodStart } },
      _count: { _all: true },
      _sum: { credits: true },
    });
    const byFeature = grouped
      .map((g) => ({
        feature: g.feature,
        count: g._count._all,
        credits: g._sum.credits ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
    const used = byFeature
      .filter((f) => f.feature !== Feature.OTHER)
      .reduce((sum, f) => sum + f.count, 0);
    const usedCredits = byFeature.reduce((sum, f) => sum + f.credits, 0);
    const limitCredits = await this.getPlanCreditLimit(tenant);
    return {
      plan: tenant.plan,
      periodStart: periodStart.toISOString(),
      used,
      usedCredits,
      limitCredits,
      byFeature,
    };
  }

  /**
   * PRODUCT_DIAGNOSIS の月次実行回数をチェック(ADR-013、Day 45)。
   *
   * - FREE プラン:本機能を実行不可(ADR-012 改訂版「Free フォールバック = AI 機能停止」)→ 403
   * - PRO / TEAM:本機能のみの月次上限 `PRODUCT_DIAGNOSIS_MAX_PER_MONTH_PRO`(50 回)+ 全体 `assertWithinFreeQuota` 内
   *
   * MVP の暴走防止枠。v1.0.1 で AI クレジット制(3 cr/回、ADR-012 §段階的実装)に移行する際に
   * 本メソッドは `assertWithinCreditQuota({ feature, costInCredits })` 等に置き換える。
   */
  async assertWithinDiagnosisQuota(tenant: { id: string; plan: Plan }): Promise<void> {
    if (tenant.plan === Plan.FREE) {
      throw new ForbiddenException(
        'プロダクト診断は Pro / Team プラン限定の機能です。Pro へのアップグレードが必要です。',
      );
    }
    const used = await this.prisma.aIUsage.count({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: startOfMonthUtc() },
        feature: Feature.PRODUCT_DIAGNOSIS,
      },
    });
    if (used >= PRODUCT_DIAGNOSIS_MAX_PER_MONTH_PRO) {
      throw new ForbiddenException(
        `プロダクト診断の月次実行回数上限(${PRODUCT_DIAGNOSIS_MAX_PER_MONTH_PRO} 回)に達しました。翌月リセットされます。`,
      );
    }
  }

  /**
   * IDEA_VALIDATION の月次実行回数をチェック(ADR-013 改訂版、Day 45)。
   *
   * - FREE プラン:本機能を実行不可 → 403(同上、ADR-012 改訂版整合)
   * - PRO / TEAM:本機能のみの月次上限 `IDEA_VALIDATION_MAX_PER_MONTH_PRO`(30 回)
   *
   * PRODUCT_DIAGNOSIS よりやや少なめの 30 回設定(発案 → Pivot → 再検証ループ想定でも十分)。
   */
  async assertWithinValidationQuota(tenant: { id: string; plan: Plan }): Promise<void> {
    if (tenant.plan === Plan.FREE) {
      throw new ForbiddenException(
        'アイデア検証は Pro / Team プラン限定の機能です。Pro へのアップグレードが必要です。',
      );
    }
    const used = await this.prisma.aIUsage.count({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: startOfMonthUtc() },
        feature: Feature.IDEA_VALIDATION,
      },
    });
    if (used >= IDEA_VALIDATION_MAX_PER_MONTH_PRO) {
      throw new ForbiddenException(
        `アイデア検証の月次実行回数上限(${IDEA_VALIDATION_MAX_PER_MONTH_PRO} 回)に達しました。翌月リセットされます。`,
      );
    }
  }

  /**
   * ANNOUNCEMENT_GEN の月次実行回数をチェック(ADR-014、Day 56)。
   *
   * - FREE プラン:本機能を実行不可(ADR-012 改訂版「Free フォールバック = AI 機能停止」)→ 403
   * - PRO / TEAM:本機能のみの月次上限 `ANNOUNCEMENT_MAX_PER_MONTH_PRO`(50 回)
   *
   * MVP の暴走防止枠。v1.0.1 で AI クレジット制(4 cr/回、`FEATURE_CREDIT_OVERRIDES`)に移行する際に
   * 本メソッドは `assertWithinPlanCredits` に統合される。
   *
   * channel 数(MVP は 2 = Twitter + Blog、v1.x で 3 = + Email)に依存しない Announcement 単位の
   * 単位カウント。message も channel 固有名(「Twitter とブログ」 等)を出さない設計で v1.x の
   * EMAIL 追加時に文言改修不要。
   */
  async assertWithinAnnouncementQuota(tenant: { id: string; plan: Plan }): Promise<void> {
    if (tenant.plan === Plan.FREE) {
      throw new ForbiddenException(
        '告知配信は Pro / Team プラン限定の機能です。Pro へのアップグレードが必要です。',
      );
    }
    const used = await this.prisma.aIUsage.count({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: startOfMonthUtc() },
        feature: Feature.ANNOUNCEMENT_GEN,
      },
    });
    if (used >= ANNOUNCEMENT_MAX_PER_MONTH_PRO) {
      throw new ForbiddenException(
        `告知配信の月次実行回数上限(${ANNOUNCEMENT_MAX_PER_MONTH_PRO} 回)に達しました。翌月リセットされます。`,
      );
    }
  }

  /** AI 呼び出し 1 回分をテナント単位で記録する。credits はモデル × Feature × turnCount から自動計算。 */
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
        credits: creditsForUsage(usage.model, usage.feature, usage.turnCount ?? 1),
      },
    });
  }

  /**
   * プラン別の当月クレジット上限。TEAM は `Subscription.quantity`(Stripe ミラー)を真実の源として算出する(ADR-012 第 2 層)。
   *
   * 取得経路:
   * - 通常: `Subscription.quantity`(Webhook + Saga 同期で最新)を seat 数として使用
   * - フォールバック: Subscription 行が無い旧テナント等は `TenantMember.count` を使用(警告ログ付き)
   *
   * Stripe Webhook 遅延・Saga 失敗で短時間ズレるが、第 3 層 reconciliation バッチ(v1.x、日次)で
   * 翌日には収束する。MVP では「請求額の真実 = Stripe Quantity」と「内部 read = Subscription.quantity」を一致させる方を優先。
   */
  private async getPlanCreditLimit(tenant: { id: string; plan: Plan }): Promise<number> {
    if (tenant.plan === Plan.TEAM) {
      const sub = await this.prisma.subscription.findUnique({
        where: { tenantId: tenant.id },
        select: { quantity: true },
      });
      if (sub) {
        return sub.quantity * TEAM_CREDITS_PER_SEAT;
      }
      // Subscription 未作成の旧テナント(Day 19 以前 / Stripe 障害復旧待ち)用フォールバック
      const seats = await this.prisma.tenantMember.count({
        where: { tenantId: tenant.id },
      });
      this.logger.warn(
        `TEAM plan tenant ${tenant.id} has no Subscription row; falling back to TenantMember.count=${seats}`,
      );
      return seats * TEAM_CREDITS_PER_SEAT;
    }
    return PLAN_CREDIT_LIMITS[tenant.plan] ?? 0;
  }

  /** 当月のクレジット消費合計。OTHER は 0 cr で記録されるため自然に除外される。 */
  private async getMonthlyCreditsUsed(tenantId: string): Promise<number> {
    const result = await this.prisma.aIUsage.aggregate({
      where: { tenantId, createdAt: { gte: startOfMonthUtc() } },
      _sum: { credits: true },
    });
    return result._sum.credits ?? 0;
  }
}
