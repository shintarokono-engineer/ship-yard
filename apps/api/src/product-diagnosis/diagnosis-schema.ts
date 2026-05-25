/**
 * PRODUCT_DIAGNOSIS の Tool Use(`submit_service_score`)スキーマと出力バリデーション(ADR-013)。
 *
 * lp-blocks.ts と同じ「Tool スキーマ + LLM 強制 + TS 側バリデーション」 の 3 段防御パターンを踏襲。
 * LLM が返した生データを `parseDiagnosisOutput` で正規化し、`totalScore === sum(breakdown.*.score)`
 * の整合性アサートで不一致を弾く(ADR-013 LLM スコアの限界対策)。
 */

import { AIBadResponseError } from '../ai/ai-error';
import {
  DIAGNOSIS_AXES,
  DIAGNOSIS_AXIS_MAX_SCORE,
  DIAGNOSIS_MAX_COMPETITOR_REFS,
  DIAGNOSIS_MAX_SUGGESTIONS,
  DIAGNOSIS_MIN_SUGGESTIONS,
  type DiagnosisAxis,
} from './diagnosis.constants';
import type { CompetitorRef, DiagnosisOutput, ScoreBreakdown, Suggestion } from './diagnosis-types';

const SUGGESTION_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
const COMPETITOR_SUMMARY_MAX_CHARS = 300;
const COMPETITOR_SIMILARITY_NOTE_MAX_CHARS = 200;
const SUGGESTION_TITLE_MAX_CHARS = 60;
const SUGGESTION_BODY_MAX_CHARS = 500;

/**
 * AI Tool Use(`submit_service_score`)の入力スキーマ。
 *
 * 判別ユニオンや厳密 enum を JSON Schema で表現すると Tool Use の安定性が落ちるため、
 * 「型は object でフィールド名と説明だけ示し、値の細かい検証は TS 側」 とする(lp-blocks
 * と同方針)。各フィールドに rubric の意図を `description` で明記し、Sonnet 4 が正しい
 * フォーマットで返しやすくする。
 */
export const SUBMIT_SERVICE_SCORE_TOOL = {
  name: 'submit_service_score',
  description:
    'プロダクト診断の結果を提出する。totalScore は breakdown の 5 軸合計と一致させること。',
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
      breakdown: {
        type: 'object',
        description:
          '5 軸ブレークダウン。全 5 軸を必ず含めること。各軸は score(0-20)と comment(根拠)を持つ。',
        properties: Object.fromEntries(
          DIAGNOSIS_AXES.map((axis) => [
            axis,
            {
              type: 'object',
              properties: {
                score: { type: 'integer', minimum: 0, maximum: DIAGNOSIS_AXIS_MAX_SCORE },
                comment: { type: 'string' },
              },
              required: ['score', 'comment'],
            },
          ]),
        ),
        required: [...DIAGNOSIS_AXES],
      },
      suggestions: {
        type: 'array',
        description: `改善提案の配列(${DIAGNOSIS_MIN_SUGGESTIONS}-${DIAGNOSIS_MAX_SUGGESTIONS} 件)。優先度・どの軸を改善するかを明記。`,
        items: {
          type: 'object',
          properties: {
            priority: { type: 'string', enum: [...SUGGESTION_PRIORITIES] },
            title: { type: 'string' },
            body: { type: 'string' },
            axis: { type: 'string', enum: [...DIAGNOSIS_AXES] },
          },
          required: ['priority', 'title', 'body', 'axis'],
        },
      },
      competitorRefs: {
        type: 'array',
        description: `Web Search で取得した競合プロダクトのスナップショット(0-${DIAGNOSIS_MAX_COMPETITOR_REFS} 件)。Web Search 無効時 / 失敗時は空配列。`,
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
    required: ['totalScore', 'breakdown', 'suggestions', 'competitorRefs'],
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
  return Math.max(0, Math.min(DIAGNOSIS_AXIS_MAX_SCORE, Math.round(n)));
}

/**
 * 競合参照 URL の安全性チェック(Defense in Depth、ADR-013 / ADR-009 `safeHref` パターン)。
 *
 * Web Search Tool が稀に `javascript:` / `data:` 等を含む URL を返す可能性に備え、サーバ側でも
 * `http://` / `https://` のみを許可する。FE 側でも `safeHref` で同じチェックを行うが、API 直接
 * 攻撃に対する多層防御として BE でも実施する。不正 URL の競合は parseDiagnosisOutput で無視。
 */
function isSafeHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * AI が生成した生の出力(`Tool Use.input`)を `DiagnosisOutput` に正規化 + 整合性検証する。
 *
 * 検証順:
 *   1. breakdown の全 5 軸が揃い、各 score が 0-20 範囲 / comment が非空
 *   2. suggestions が 3-5 件、各フィールドが揃い、axis が既知
 *   3. competitorRefs が 0-5 件、url / summary 等が揃う(無効 URL のサニタイズは FE 側)
 *   4. totalScore === sum(breakdown.*.score) の整合性アサート(LLM の合計ミス防御)
 *
 * いずれかの検証で失敗したら `AIBadResponseError`(502)を投げる。
 */
export function parseDiagnosisOutput(raw: unknown): DiagnosisOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new AIBadResponseError('Claude returned non-object diagnosis output (PRODUCT_DIAGNOSIS)');
  }
  const r = raw as Record<string, unknown>;

  // 1. breakdown
  const rawBreakdown = (
    typeof r.breakdown === 'object' && r.breakdown !== null ? r.breakdown : {}
  ) as Record<string, unknown>;
  const breakdown = {} as ScoreBreakdown;
  for (const axis of DIAGNOSIS_AXES) {
    const entry = rawBreakdown[axis];
    if (typeof entry !== 'object' || entry === null) {
      throw new AIBadResponseError(
        `Claude returned missing axis "${axis}" in breakdown (PRODUCT_DIAGNOSIS)`,
      );
    }
    const e = entry as Record<string, unknown>;
    const score = clampScore(asInt(e.score));
    const comment = asString(e.comment);
    if (!comment) {
      throw new AIBadResponseError(
        `Claude returned empty comment for axis "${axis}" (PRODUCT_DIAGNOSIS)`,
      );
    }
    breakdown[axis as DiagnosisAxis] = { score, comment };
  }

  // 2. suggestions
  const suggestions: Suggestion[] = [];
  for (const item of asArray(r.suggestions)) {
    if (suggestions.length >= DIAGNOSIS_MAX_SUGGESTIONS) break;
    if (typeof item !== 'object' || item === null) continue;
    const it = item as Record<string, unknown>;
    const priority = asString(it.priority).toUpperCase();
    const title = asString(it.title);
    const body = asString(it.body);
    const axis = asString(it.axis);
    if (!(SUGGESTION_PRIORITIES as readonly string[]).includes(priority)) continue;
    if (!(DIAGNOSIS_AXES as readonly string[]).includes(axis)) continue;
    if (!title || !body) continue;
    suggestions.push({
      priority: priority as Suggestion['priority'],
      title: truncate(title, SUGGESTION_TITLE_MAX_CHARS),
      body: truncate(body, SUGGESTION_BODY_MAX_CHARS),
      axis: axis as DiagnosisAxis,
    });
  }
  if (suggestions.length < DIAGNOSIS_MIN_SUGGESTIONS) {
    throw new AIBadResponseError(
      `Claude returned fewer than ${DIAGNOSIS_MIN_SUGGESTIONS} valid suggestions (PRODUCT_DIAGNOSIS)`,
    );
  }

  // 3. competitorRefs(0 件は許容、Free フォールバック / Web Search 失敗時の正常パス)
  const competitorRefs: CompetitorRef[] = [];
  for (const item of asArray(r.competitorRefs)) {
    if (competitorRefs.length >= DIAGNOSIS_MAX_COMPETITOR_REFS) break;
    if (typeof item !== 'object' || item === null) continue;
    const it = item as Record<string, unknown>;
    const name = asString(it.name);
    const url = asString(it.url);
    if (!name || !url) continue;
    // Defense in Depth: http / https 以外の URL(javascript: 等)はサーバ側でも弾く
    if (!isSafeHttpUrl(url)) continue;
    competitorRefs.push({
      name,
      url,
      summary: truncate(asString(it.summary), COMPETITOR_SUMMARY_MAX_CHARS),
      similarityNote: truncate(asString(it.similarityNote), COMPETITOR_SIMILARITY_NOTE_MAX_CHARS),
    });
  }

  // 4. totalScore 整合性(LLM の合計ミス防御、ADR-013 LLM スコアの限界対策の中核)
  const totalScore = asInt(r.totalScore);
  const expectedTotal = DIAGNOSIS_AXES.reduce((sum, axis) => sum + breakdown[axis].score, 0);
  if (totalScore !== expectedTotal) {
    throw new AIBadResponseError(
      `Claude returned inconsistent totalScore=${totalScore} but breakdown sums to ${expectedTotal} (PRODUCT_DIAGNOSIS)`,
    );
  }

  return { totalScore, breakdown, suggestions, competitorRefs };
}
