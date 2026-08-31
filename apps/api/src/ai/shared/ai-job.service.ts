import { Injectable, Logger } from '@nestjs/common';
import { AiJobStatus, type Feature } from '@shipyard/db';

import { PrismaService } from '../../prisma/prisma.service';
import { AIUsageService } from './ai-usage.service';
import { AI_JOB_RECENT_FAILURE_MS, AI_JOB_STALE_MS } from './ai.constants';

/** ポーリング API が返す進行状態。結果本体は `resultId` から別途取得する。 */
export interface AiJobView {
  id: string;
  status: AiJobStatus;
  resultId: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

/**
 * 長時間 AI 処理の進行状態を管理する(ADR-016)。
 *
 * プロダクト診断 / アイデア検証は 88〜113 秒かかり、Vercel Hobby の関数実行上限(60 秒)と
 * FE の `API_TIMEOUT_MS`(55 秒)を超えるため同期実行では UI から完走できない。
 * POST は予約とジョブ作成だけを同期で行って即返し、AI 実行は切り離して継続する。
 * App Runner は常駐 Node プロセスのため、レスポンス送出後も処理を続けられる(キュー不要)。
 *
 * 結果本体は `ServiceScore` / `IdeaValidation` が持つ。本サービスは進行状態と結果 ID だけを扱う。
 */
@Injectable()
export class AiJobService {
  private readonly logger = new Logger(AiJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiUsage: AIUsageService,
  ) {}

  /**
   * 同一プロジェクト + 同一機能で実行中のジョブを 1 件返す(無ければ null)。
   *
   * **多重実行の抑止に使う。**同期実行時代はレスポンス待ちの間ボタンが無効化されるため
   * 二重送信が実質的に防がれていたが、ADR-016 で即座に応答するようになったため、
   * 連打すると N 件が並走し そのつどクレジットが予約される。呼び出し側で予約の**前**に確認すること。
   */
  async findRunning(
    tenantId: string,
    projectId: string,
    feature: Feature,
  ): Promise<{ id: string } | null> {
    return this.prisma.aiJob.findFirst({
      where: { tenantId, projectId, feature, status: AiJobStatus.RUNNING },
      select: { id: true },
    });
  }

  /** ジョブを RUNNING で作成し id を返す。クレジット予約の直後に同期で呼ぶこと。 */
  async start(input: {
    tenantId: string;
    projectId: string;
    feature: Feature;
    createdById: string;
    /** クレジット予約行の ID。取り残し時にこれを使って解放する。 */
    reservationId: string;
  }): Promise<string> {
    const job = await this.prisma.aiJob.create({
      data: {
        tenantId: input.tenantId,
        projectId: input.projectId,
        feature: input.feature,
        createdById: input.createdById,
        reservationId: input.reservationId,
        status: AiJobStatus.RUNNING,
      },
      select: { id: true },
    });
    return job.id;
  }

  /**
   * 成功時。結果 ID を紐付けて DONE にする。
   *
   * `reservationId` を null に戻すのは、呼び出し側が既に予約を確定(`finalizeReservation`)しており、
   * 取り残し回収に二重で解放させないため。
   */
  async complete(jobId: string, resultId: string): Promise<void> {
    await this.prisma.aiJob.updateMany({
      where: { id: jobId },
      data: { status: AiJobStatus.DONE, resultId, reservationId: null },
    });
  }

  /**
   * 失敗時。ユーザー向けメッセージを添えて FAILED にする。
   *
   * 背景実行の中で呼ばれるため、ここで例外を投げると unhandled rejection になる。
   * 記録に失敗してもジョブは stale 判定で FAILED に倒れるので、握って警告に留める。
   */
  async fail(jobId: string, errorMessage: string): Promise<void> {
    try {
      await this.prisma.aiJob.updateMany({
        where: { id: jobId },
        data: { status: AiJobStatus.FAILED, errorMessage, reservationId: null },
      });
    } catch (err) {
      this.logger.warn(`Failed to record AiJob failure (jobId=${jobId}): ${String(err)}`);
    }
  }

  /**
   * 取り残し(RUNNING のまま古い)を FAILED に倒し、**押さえたままのクレジット予約を解放する**。
   *
   * 予約は AI 呼び出しの前に `AIUsage` の行として INSERT され、成功で確定・失敗で削除されるが、
   * プロセスが落ちるとどちらも走らず**予約行が残り続けてユーザーの当月枠を食う**。
   * 同期実行では起こり得なかったが、ADR-016 で実行を切り離したことで発生しうる。
   *
   * `fail()` が `reservationId` を null に戻すため、二重解放にはならない。
   *
   * TODO(v1.x): 参照系(GET)の中で書き込みをしている。実行頻度が低く N も小さいので当面は許容するが、
   * ジョブ数が増えたら日次バッチ(`jobs/` モジュール)へ寄せる。
   */
  private async reclaimStale(job: { id: string; reservationId: string | null }): Promise<string> {
    const errorMessage = '処理が中断されました。時間をおいて再実行してください。';
    this.logger.warn(`AiJob ${job.id} timed out while RUNNING; marking FAILED`);
    if (job.reservationId) {
      // 解放に失敗しても FAILED 化は進める(予約が残る方がマシで、握って警告に留める)。
      try {
        await this.aiUsage.releaseReservation(job.reservationId);
      } catch (err) {
        this.logger.warn(
          `Failed to release credit reservation ${job.reservationId} for AiJob ${job.id}: ${String(err)}`,
        );
      }
    }
    await this.fail(job.id, errorMessage);
    return errorMessage;
  }

  /**
   * ジョブを 1 件取得する(ポーリング用)。テナント + プロジェクトで絞るため他テナントは見えない。
   *
   * **取り残しの回収**: App Runner が再起動すると背景処理ごと消えるが `status` は RUNNING のまま残る。
   * ユーザーを無限に待たせないよう、`updatedAt` が `AI_JOB_STALE_MS` より古い RUNNING は
   * FAILED に倒して返す。倒した結果を永続化するのは、次回以降のポーリングで同じ判定を繰り返さないため。
   */
  async get(tenantId: string, projectId: string, jobId: string): Promise<AiJobView | null> {
    const job = await this.prisma.aiJob.findFirst({
      where: { id: jobId, tenantId, projectId },
      select: {
        id: true,
        status: true,
        resultId: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
        reservationId: true,
      },
    });
    if (!job) return null;

    const isStale =
      job.status === AiJobStatus.RUNNING && Date.now() - job.updatedAt.getTime() > AI_JOB_STALE_MS;
    if (!isStale) {
      return {
        id: job.id,
        status: job.status,
        resultId: job.resultId,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
      };
    }

    const errorMessage = await this.reclaimStale(job);
    return {
      id: job.id,
      status: AiJobStatus.FAILED,
      resultId: null,
      errorMessage,
      createdAt: job.createdAt,
    };
  }

  /**
   * 一覧に混ぜて見せるジョブを返す(ADR-016、履歴一覧の「実行中」 行用)。
   *
   * 返すのは **RUNNING と、直近の FAILED だけ**。DONE は結果本体(`ServiceScore` /
   * `IdeaValidation`)が一覧に出るので重複させない。
   *
   * FAILED を直近に絞るのは、古い失敗が一覧に残り続けても行動につながらないため。
   * ただし「実行したのに結果が無い。クレジットはどうなった」 を確認できる必要があるので、
   * 一晩越しでも見えるよう `AI_JOB_RECENT_FAILURE_MS`(24 時間)を取っている。
   */
  async listActive(tenantId: string, projectId: string, feature: Feature): Promise<AiJobView[]> {
    const jobs = await this.prisma.aiJob.findMany({
      where: {
        tenantId,
        projectId,
        feature,
        OR: [
          { status: AiJobStatus.RUNNING },
          {
            status: AiJobStatus.FAILED,
            createdAt: { gt: new Date(Date.now() - AI_JOB_RECENT_FAILURE_MS) },
          },
        ],
      },
      select: {
        id: true,
        status: true,
        resultId: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
        reservationId: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // 取り残し(RUNNING のまま古い)は `get` と同じ基準で FAILED に倒す。
    const staleBefore = Date.now() - AI_JOB_STALE_MS;
    const views: AiJobView[] = [];
    for (const job of jobs) {
      if (job.status === AiJobStatus.RUNNING && job.updatedAt.getTime() < staleBefore) {
        const errorMessage = await this.reclaimStale(job);
        views.push({
          id: job.id,
          status: AiJobStatus.FAILED,
          resultId: null,
          errorMessage,
          createdAt: job.createdAt,
        });
        continue;
      }
      views.push({
        id: job.id,
        status: job.status,
        resultId: job.resultId,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
      });
    }
    return views;
  }
}
