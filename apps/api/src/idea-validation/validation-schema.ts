/**
 * IDEA_VALIDATION の Tool Use(`submit_idea_validation`)スキーマと出力バリデーション
 * (ADR-013 改訂版「2 モード化」)。
 *
 * PRODUCT_DIAGNOSIS の `diagnosis-schema.ts` と同パターン(「Tool スキーマ + LLM 強制 +
 * TS 側バリデーション」 の 3 段防御)。差分は (1) 評価軸が異なる、(2) recommendation が追加、
 * (3) totalScore = sum of breakdown.score の整合性アサートは同じ。
 */

import { AIBadResponseError } from '../ai/shared/ai-error';
import type {
  PublicCheckOutput,
  ValidationBreakdown,
  ValidationCompetitorRef,
  ValidationOutput,
  ValidationSuggestion,
} from './validation-types';
import {
  PUBLIC_CHECK_AXES,
  VALIDATION_AXES,
  VALIDATION_AXIS_MAX_SCORE,
  VALIDATION_MAX_COMPETITOR_REFS,
  VALIDATION_MAX_SUGGESTIONS,
  VALIDATION_MIN_SUGGESTIONS,
  VALIDATION_RECOMMENDATIONS,
  type ValidationAxis,
} from './validation.constants';

const SUGGESTION_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
const COMPETITOR_SUMMARY_MAX_CHARS = 300;
const COMPETITOR_SIMILARITY_NOTE_MAX_CHARS = 200;
const SUGGESTION_TITLE_MAX_CHARS = 60;
const SUGGESTION_BODY_MAX_CHARS = 500;

/**
 * `buildSubmitValidationTool` / `parse*` が共有する構成。
 *
 * 無料公開版 `/check`(ADR-015)は Web Search を回さないため、実競合に依存する
 * 2 軸・`recommendation`・`competitorRefs` を落とす。
 */
export interface ValidationSchemaOptions {
  /** 採点対象の軸。 */
  axes: readonly ValidationAxis[];
  /** GO / PIVOT / NO_GO を要求するか。 */
  withRecommendation: boolean;
  /** 競合参照を要求するか。 */
  withCompetitorRefs: boolean;
}

/** 有料版(`IDEA_VALIDATION`)の構成。全 5 軸 + recommendation + 競合参照。 */
export const FULL_VALIDATION_SCHEMA_OPTIONS: ValidationSchemaOptions = {
  axes: VALIDATION_AXES,
  withRecommendation: true,
  withCompetitorRefs: true,
};

/** 無料公開版(`/check`)の構成。3 軸のみ、recommendation と競合参照は出さない。 */
export const PUBLIC_CHECK_SCHEMA_OPTIONS: ValidationSchemaOptions = {
  axes: PUBLIC_CHECK_AXES,
  withRecommendation: false,
  withCompetitorRefs: false,
};

/**
 * AI Tool Use(`submit_idea_validation`)の入力スキーマを組み立てる。
 * `SUBMIT_SERVICE_SCORE_TOOL` と同パターン(lp-blocks / product-diagnosis 踏襲)。
 *
 * **プロパティの並び順を変えないこと。**既定引数での出力が有料版の既存スキーマと
 * 完全一致することが、この引数化が透過であることの担保になっている。
 */
export function buildSubmitValidationTool(
  options: ValidationSchemaOptions = FULL_VALIDATION_SCHEMA_OPTIONS,
) {
  const { axes, withRecommendation, withCompetitorRefs } = options;
  const maxTotalScore = axes.length * VALIDATION_AXIS_MAX_SCORE;

  return {
    name: 'submit_idea_validation',
    description: `アイデア検証の結果を提出する。totalScore は breakdown の ${axes.length} 軸合計と一致させ${
      withRecommendation ? '、recommendation は基準に従って判定すること' : 'ること'
    }。`,
    input_schema: {
      type: 'object' as const,
      properties: {
        totalScore: {
          type: 'integer',
          minimum: 0,
          maximum: maxTotalScore,
          description: `総合スコア(0-${maxTotalScore})。breakdown の ${axes.length} 軸合計と必ず一致させること。不一致は不正回答として扱われる。`,
        },
        ...(withRecommendation
          ? {
              recommendation: {
                type: 'string',
                enum: [...VALIDATION_RECOMMENDATIONS],
                description:
                  '意思決定支援。GO(進める)/ PIVOT(方向修正)/ NO_GO(根本再検討)のいずれかを基準に従って判定。',
              },
            }
          : {}),
        breakdown: {
          type: 'object',
          description: `${axes.length} 軸ブレークダウン。全 ${axes.length} 軸を必ず含めること。各軸は score(0-${VALIDATION_AXIS_MAX_SCORE})と comment(根拠)を持つ。`,
          properties: Object.fromEntries(
            axes.map((axis) => [
              axis,
              {
                type: 'object',
                properties: {
                  score: { type: 'integer', minimum: 0, maximum: VALIDATION_AXIS_MAX_SCORE },
                  comment: { type: 'string' },
                },
                required: ['score', 'comment'],
              },
            ]),
          ),
          required: [...axes],
        },
        suggestions: {
          type: 'array',
          description: `改善提案の配列(${VALIDATION_MIN_SUGGESTIONS}-${VALIDATION_MAX_SUGGESTIONS} 件)。優先度・どの軸を改善するかを明記。`,
          items: {
            type: 'object',
            properties: {
              priority: { type: 'string', enum: [...SUGGESTION_PRIORITIES] },
              title: { type: 'string' },
              body: { type: 'string' },
              axis: { type: 'string', enum: [...axes] },
            },
            required: ['priority', 'title', 'body', 'axis'],
          },
        },
        ...(withCompetitorRefs
          ? {
              competitorRefs: {
                type: 'array',
                description: `Web Search で取得した競合プロダクトのスナップショット(0-${VALIDATION_MAX_COMPETITOR_REFS} 件)。Web Search 無効時 / 失敗時は空配列。`,
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    url: { type: 'string' },
                    summary: { type: 'string' },
                    similarityNote: { type: 'string' },
                  },
                  required: ['name', 'url', 'summary', 'similarityNote'],
                },
              },
            }
          : {}),
      },
      required: [
        'totalScore',
        ...(withRecommendation ? ['recommendation'] : []),
        'breakdown',
        'suggestions',
        ...(withCompetitorRefs ? ['competitorRefs'] : []),
      ],
    },
  };
}

/** 有料版(`IDEA_VALIDATION`)の Tool 定義。 */
export const SUBMIT_IDEA_VALIDATION_TOOL = buildSubmitValidationTool();

/** 無料公開版(`/check`)の Tool 定義。 */
export const SUBMIT_PUBLIC_CHECK_TOOL = buildSubmitValidationTool(PUBLIC_CHECK_SCHEMA_OPTIONS);

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return Number.NaN;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(VALIDATION_AXIS_MAX_SCORE, Math.round(n)));
}

/** Defense in Depth: http / https 以外の URL(javascript: 等)はサーバ側でも弾く(ADR-009 safeHref パターン)。 */
function isSafeHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

/**
 * breakdown の全軸を検証して正規化する。軸が 1 つでも欠けたら throw する。
 *
 * `label` は例外メッセージに載る機能名で、ログから有料版 / 公開版のどちらかを分ける。
 */
function parseBreakdown<A extends ValidationAxis>(
  raw: Record<string, unknown>,
  axes: readonly A[],
  label: string,
): ValidationBreakdown<A> {
  const rawBreakdown = asRecord(raw.breakdown);
  const breakdown = {} as ValidationBreakdown<A>;
  for (const axis of axes) {
    const entry = rawBreakdown[axis];
    if (typeof entry !== 'object' || entry === null) {
      throw new AIBadResponseError(
        `Claude returned missing axis "${axis}" in breakdown (${label})`,
      );
    }
    const e = entry as Record<string, unknown>;
    const score = clampScore(asInt(e.score));
    const comment = asString(e.comment);
    if (!comment) {
      throw new AIBadResponseError(`Claude returned empty comment for axis "${axis}" (${label})`);
    }
    breakdown[axis] = { score, comment };
  }
  return breakdown;
}

/** 改善提案を検証して正規化する。**画面の主役なので、3 件に満たなければ throw する。** */
function parseSuggestions<A extends ValidationAxis>(
  raw: Record<string, unknown>,
  axes: readonly A[],
  label: string,
): ValidationSuggestion<A>[] {
  const suggestions: ValidationSuggestion<A>[] = [];
  for (const item of asArray(raw.suggestions)) {
    if (suggestions.length >= VALIDATION_MAX_SUGGESTIONS) break;
    if (typeof item !== 'object' || item === null) continue;
    const it = item as Record<string, unknown>;
    const priority = asString(it.priority).toUpperCase();
    const title = asString(it.title);
    const body = asString(it.body);
    const axis = asString(it.axis);
    if (!(SUGGESTION_PRIORITIES as readonly string[]).includes(priority)) continue;
    // ロックした 2 軸に紐づく提案は、その軸を採点していないため落とす。
    if (!(axes as readonly string[]).includes(axis)) continue;
    if (!title || !body) continue;
    suggestions.push({
      priority: priority as ValidationSuggestion['priority'],
      title: truncate(title, SUGGESTION_TITLE_MAX_CHARS),
      body: truncate(body, SUGGESTION_BODY_MAX_CHARS),
      axis: axis as A,
    });
  }
  if (suggestions.length < VALIDATION_MIN_SUGGESTIONS) {
    throw new AIBadResponseError(
      `Claude returned fewer than ${VALIDATION_MIN_SUGGESTIONS} valid suggestions (${label})`,
    );
  }
  return suggestions;
}

/** totalScore が breakdown の合計と一致することを確認する(LLM の合計ミス防御)。 */
function parseTotalScore<A extends ValidationAxis>(
  raw: Record<string, unknown>,
  breakdown: ValidationBreakdown<A>,
  axes: readonly A[],
  label: string,
): number {
  const totalScore = asInt(raw.totalScore);
  const expectedTotal = axes.reduce((sum, axis) => sum + breakdown[axis].score, 0);
  if (totalScore !== expectedTotal) {
    throw new AIBadResponseError(
      `Claude returned inconsistent totalScore=${totalScore} but breakdown sums to ${expectedTotal} (${label})`,
    );
  }
  return totalScore;
}

/**
 * AI が生成した生の出力(`Tool Use.input`)を `ValidationOutput` に正規化 + 整合性検証する。
 *
 * 検証順:
 *   1. recommendation が `VALIDATION_RECOMMENDATIONS` のいずれか
 *   2. breakdown の全 5 軸が揃い、各 score が 0-20 範囲 / comment が非空
 *   3. suggestions が 3-5 件、各フィールドが揃い、axis が既知
 *   4. competitorRefs が 0-5 件、url の isSafeHttpUrl 検証(Defense in Depth)
 *   5. totalScore === sum(breakdown.*.score) の整合性アサート(LLM の合計ミス防御)
 */
export function parseValidationOutput(raw: unknown): ValidationOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new AIBadResponseError('Claude returned non-object validation output (IDEA_VALIDATION)');
  }
  const r = raw as Record<string, unknown>;

  // 1. recommendation
  const recommendation = asString(r.recommendation).toUpperCase();
  if (!(VALIDATION_RECOMMENDATIONS as readonly string[]).includes(recommendation)) {
    throw new AIBadResponseError(
      `Claude returned invalid recommendation "${recommendation}" (IDEA_VALIDATION)`,
    );
  }

  // 2-3. breakdown / suggestions
  const breakdown = parseBreakdown(r, VALIDATION_AXES, 'IDEA_VALIDATION');
  const suggestions = parseSuggestions(r, VALIDATION_AXES, 'IDEA_VALIDATION');

  // 4. competitorRefs(0 件は許容、Free フォールバック / Web Search 失敗時の正常パス)
  const competitorRefs: ValidationCompetitorRef[] = [];
  for (const item of asArray(r.competitorRefs)) {
    if (competitorRefs.length >= VALIDATION_MAX_COMPETITOR_REFS) break;
    if (typeof item !== 'object' || item === null) continue;
    const it = item as Record<string, unknown>;
    const name = asString(it.name);
    const url = asString(it.url);
    if (!name || !url) continue;
    if (!isSafeHttpUrl(url)) continue;
    competitorRefs.push({
      name,
      url,
      summary: truncate(asString(it.summary), COMPETITOR_SUMMARY_MAX_CHARS),
      similarityNote: truncate(asString(it.similarityNote), COMPETITOR_SIMILARITY_NOTE_MAX_CHARS),
    });
  }

  // 5. totalScore の整合性
  return {
    totalScore: parseTotalScore(r, breakdown, VALIDATION_AXES, 'IDEA_VALIDATION'),
    recommendation: recommendation as ValidationOutput['recommendation'],
    breakdown,
    suggestions,
    competitorRefs,
  };
}

/**
 * 無料公開版 `/check` の出力を正規化 + 整合性検証する(ADR-015)。
 *
 * 有料版と同じ 3 段防御(Tool スキーマ / TS バリデーション / 合計の整合性アサート)を通す。
 * **`totalScore` は 0〜60 のまま返す**(100 点への正規化は表示層でのみ行う)。
 */
export function parsePublicCheckOutput(raw: unknown): PublicCheckOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new AIBadResponseError('Claude returned non-object validation output (PUBLIC_CHECK)');
  }
  const r = raw as Record<string, unknown>;

  const breakdown = parseBreakdown(r, PUBLIC_CHECK_AXES, 'PUBLIC_CHECK');
  return {
    totalScore: parseTotalScore(r, breakdown, PUBLIC_CHECK_AXES, 'PUBLIC_CHECK'),
    breakdown,
    suggestions: parseSuggestions(r, PUBLIC_CHECK_AXES, 'PUBLIC_CHECK'),
  };
}
