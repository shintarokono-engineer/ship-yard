/**
 * IDEA_VALIDATION の Tool Use(`submit_idea_validation`)スキーマと出力バリデーション
 * (ADR-013 改訂版「2 モード化」)。
 *
 * PRODUCT_DIAGNOSIS の `diagnosis-schema.ts` と同パターン(「Tool スキーマ + LLM 強制 +
 * TS 側バリデーション」 の 3 段防御)。差分は (1) 評価軸が異なる、(2) recommendation が追加、
 * (3) totalScore = sum of breakdown.score の整合性アサートは同じ。
 */

import { AIBadResponseError } from '../ai/ai-error';
import type {
  ValidationBreakdown,
  ValidationCompetitorRef,
  ValidationOutput,
  ValidationSuggestion,
} from './validation-types';
import {
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
 * AI Tool Use(`submit_idea_validation`)の入力スキーマ。
 * `SUBMIT_SERVICE_SCORE_TOOL` と同パターン(lp-blocks / product-diagnosis 踏襲)。
 */
export const SUBMIT_IDEA_VALIDATION_TOOL = {
  name: 'submit_idea_validation',
  description:
    'アイデア検証の結果を提出する。totalScore は breakdown の 5 軸合計と一致させ、recommendation は基準に従って判定すること。',
  input_schema: {
    type: 'object' as const,
    properties: {
      totalScore: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description:
          '総合スコア(0-100)。breakdown の 5 軸合計と必ず一致させること。不一致は不正回答として扱われる。',
      },
      recommendation: {
        type: 'string',
        enum: [...VALIDATION_RECOMMENDATIONS],
        description:
          '意思決定支援。GO(進める)/ PIVOT(方向修正)/ NO_GO(根本再検討)のいずれかを基準に従って判定。',
      },
      breakdown: {
        type: 'object',
        description:
          '5 軸ブレークダウン。全 5 軸を必ず含めること。各軸は score(0-20)と comment(根拠)を持つ。',
        properties: Object.fromEntries(
          VALIDATION_AXES.map((axis) => [
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
        required: [...VALIDATION_AXES],
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
            axis: { type: 'string', enum: [...VALIDATION_AXES] },
          },
          required: ['priority', 'title', 'body', 'axis'],
        },
      },
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
    },
    required: ['totalScore', 'recommendation', 'breakdown', 'suggestions', 'competitorRefs'],
  },
};

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

  // 2. breakdown
  const rawBreakdown = (
    typeof r.breakdown === 'object' && r.breakdown !== null ? r.breakdown : {}
  ) as Record<string, unknown>;
  const breakdown = {} as ValidationBreakdown;
  for (const axis of VALIDATION_AXES) {
    const entry = rawBreakdown[axis];
    if (typeof entry !== 'object' || entry === null) {
      throw new AIBadResponseError(
        `Claude returned missing axis "${axis}" in breakdown (IDEA_VALIDATION)`,
      );
    }
    const e = entry as Record<string, unknown>;
    const score = clampScore(asInt(e.score));
    const comment = asString(e.comment);
    if (!comment) {
      throw new AIBadResponseError(
        `Claude returned empty comment for axis "${axis}" (IDEA_VALIDATION)`,
      );
    }
    breakdown[axis as ValidationAxis] = { score, comment };
  }

  // 3. suggestions
  const suggestions: ValidationSuggestion[] = [];
  for (const item of asArray(r.suggestions)) {
    if (suggestions.length >= VALIDATION_MAX_SUGGESTIONS) break;
    if (typeof item !== 'object' || item === null) continue;
    const it = item as Record<string, unknown>;
    const priority = asString(it.priority).toUpperCase();
    const title = asString(it.title);
    const body = asString(it.body);
    const axis = asString(it.axis);
    if (!(SUGGESTION_PRIORITIES as readonly string[]).includes(priority)) continue;
    if (!(VALIDATION_AXES as readonly string[]).includes(axis)) continue;
    if (!title || !body) continue;
    suggestions.push({
      priority: priority as ValidationSuggestion['priority'],
      title: truncate(title, SUGGESTION_TITLE_MAX_CHARS),
      body: truncate(body, SUGGESTION_BODY_MAX_CHARS),
      axis: axis as ValidationAxis,
    });
  }
  if (suggestions.length < VALIDATION_MIN_SUGGESTIONS) {
    throw new AIBadResponseError(
      `Claude returned fewer than ${VALIDATION_MIN_SUGGESTIONS} valid suggestions (IDEA_VALIDATION)`,
    );
  }

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

  // 5. totalScore 整合性
  const totalScore = asInt(r.totalScore);
  const expectedTotal = VALIDATION_AXES.reduce((sum, axis) => sum + breakdown[axis].score, 0);
  if (totalScore !== expectedTotal) {
    throw new AIBadResponseError(
      `Claude returned inconsistent totalScore=${totalScore} but breakdown sums to ${expectedTotal} (IDEA_VALIDATION)`,
    );
  }

  return {
    totalScore,
    recommendation: recommendation as ValidationOutput['recommendation'],
    breakdown,
    suggestions,
    competitorRefs,
  };
}
