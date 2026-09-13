/**
 * IDEA_VALIDATION(アイデア検証、ADR-013 改訂版「2 モード化」)の Json 構造化型。
 *
 * `IdeaValidation.breakdown` / `.suggestions` / `.competitorRefs` の各 Json 列に保存される
 * データの形を TypeScript 型として唯一の真実の源として定義する。本ファイルが
 * `validation-schema.ts` の Tool Use input_schema・`parseValidationOutput` のバリデーション・
 * FE 側の表示型(`apps/web/src/lib/api/types.ts` で別途定義予定)の基準となる。
 *
 * ServiceScore(PRODUCT_DIAGNOSIS)とフィールド構造はほぼ同じだが、軸が異なる
 * (problemClarity / targetClarity / differentiation / competitiveAdvantage / marketPotential)
 * + recommendation('GO' | 'PIVOT' | 'NO_GO')を追加。
 */

import type {
  PublicCheckAxis,
  ValidationAxis,
  ValidationRecommendation,
} from './validation.constants';

/**
 * ブレークダウン(対象軸を網羅、Record で型強制)。
 *
 * 例: `{ problemClarity: { score: 14, comment: "..." }, targetClarity: ... }`
 *
 * 軸をジェネリックにしているのは、無料公開版 `/check` が 3 軸だけを採点するため(ADR-015)。
 */
export type ValidationBreakdown<A extends ValidationAxis = ValidationAxis> = Record<
  A,
  { score: number; comment: string }
>;

/** 改善提案 1 件(優先度付き、どの軸を改善するか紐付け)。ServiceScore.Suggestion と同型。 */
export interface ValidationSuggestion<A extends ValidationAxis = ValidationAxis> {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 提案のタイトル(1 行、60 文字以内推奨)。 */
  title: string;
  /** 提案の詳細(Markdown 可、500 文字以内推奨)。 */
  body: string;
  /** どの軸を改善するか。 */
  axis: A;
}

/** 競合プロダクトのスナップショット。ServiceScore.CompetitorRef と同型。 */
export interface ValidationCompetitorRef {
  name: string;
  url: string;
  /** Web Search で取得した概要(300 文字以内に切り詰め)。 */
  summary: string;
  /** 本アイデアとの類似性メモ(Sonnet が生成、200 文字以内)。 */
  similarityNote: string;
}

/**
 * 無料公開版 `/check` の出力(ADR-015)。
 *
 * Web Search を回さないため、有料版から 3 軸・`recommendation`・`competitorRefs` を落としている。
 */
export interface PublicCheckOutput {
  /** 総合スコア(**0〜60**、3 軸合計)。表示時に 5/3 倍して 100 点満点にする。 */
  totalScore: number;
  breakdown: ValidationBreakdown<PublicCheckAxis>;
  suggestions: ValidationSuggestion<PublicCheckAxis>[];
}

/** Tool Use(`submit_idea_validation`)で受け取る生データの構造。 */
export interface ValidationOutput {
  totalScore: number;
  recommendation: ValidationRecommendation;
  breakdown: ValidationBreakdown;
  suggestions: ValidationSuggestion[];
  competitorRefs: ValidationCompetitorRef[];
}
