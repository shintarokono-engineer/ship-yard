/**
 * PRODUCT_DIAGNOSIS(プロダクト診断、ADR-013)の Json 構造化型。
 *
 * `ServiceScore.breakdown` / `.suggestions` / `.competitorRefs` の各 Json 列に保存される
 * データの形を TypeScript 型として唯一の真実の源として定義する。本ファイルが
 * `diagnosis-schema.ts` の Tool Use input_schema・`parseDiagnosisOutput` のバリデーション・
 * FE 側の表示型(`apps/web/src/lib/api/types.ts` で別途定義、Day 45-46 で同期)の基準となる。
 */

import type { DiagnosisAxis } from './diagnosis.constants';

/**
 * 5 軸ブレークダウン(全 5 軸を網羅、Record で型強制)。
 *
 * 例: `{ differentiation: { score: 14, comment: "..." }, targetClarity: { score: 12, comment: "..." }, ... }`
 *
 * 各軸の `score` は 0-20 の整数、`comment` は採点の根拠を 1-3 文で記述。
 */
export type ScoreBreakdown = Record<DiagnosisAxis, { score: number; comment: string }>;

/** 改善提案 1 件(優先度付き、どの軸を改善するか紐付け)。 */
export interface Suggestion {
  /** 優先度(HIGH を最大 2 件、MEDIUM を 1-2 件、LOW を 0-1 件 程度を目安に rubric で指示)。 */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 提案のタイトル(1 行、60 文字以内推奨)。 */
  title: string;
  /** 提案の詳細(Markdown 可、500 文字以内推奨)。 */
  body: string;
  /** どの軸を改善するか(`DIAGNOSIS_AXES` のいずれか)。 */
  axis: DiagnosisAxis;
}

/** 競合プロダクトのスナップショット(Web Search で取得した実競合の参照)。 */
export interface CompetitorRef {
  /** 競合プロダクト名。 */
  name: string;
  /** 公式 URL(`safeHref` で `javascript:` 等を無害化、ADR-009 と同パターン、Day 45-46 FE で実施)。 */
  url: string;
  /** Web Search で取得した概要(300 文字以内に切り詰め、`parseDiagnosisOutput` で truncate)。 */
  summary: string;
  /** 本プロダクトとの類似性メモ(Sonnet が生成、200 文字以内)。 */
  similarityNote: string;
}

/** Tool Use(`submit_service_score`)で受け取る生データの構造。 */
export interface DiagnosisOutput {
  totalScore: number;
  breakdown: ScoreBreakdown;
  suggestions: Suggestion[];
  competitorRefs: CompetitorRef[];
}
