import { BadRequestException } from '@nestjs/common';

import {
  DIAGNOSIS_AXIS_RUBRIC,
  DIAGNOSIS_MAX_SUGGESTIONS,
  type DiagnosisAxis,
} from '../../product-diagnosis/diagnosis.constants';
import {
  VALIDATION_AXIS_RUBRIC,
  VALIDATION_MAX_SUGGESTIONS,
  type ValidationAxis,
} from '../../idea-validation/validation.constants';

/**
 * 改善提案(`ServiceScore.suggestions` / `IdeaValidation.suggestions`)から、
 * ユーザーが選んだものを取り出す(F17)。
 *
 * **なぜ提案本文を FE から受け取らないか**:
 * 本文はそのまま LLM のプロンプトに入る。FE から任意文字列を送れる設計にすると、WRITER が
 * 「AI 自身が出した推奨」という強い文脈付きで数千字を注入できてしまう。ここで DB 行から
 * 引き直すことで、プロンプトに入るのは `parseDiagnosisOutput` / `parseValidationOutput` が
 * 保存時に正規化した値(priority が enum、axis が既知集合、title/body が字数制限内)だけになる。
 *
 * FE から受け取るのは `{ source, sourceId, indexes[] }` のみ。`sourceId` の取得は呼び出し側の
 * `getById(tenantId, id)` がテナント分離のアンカーになる。
 *
 * **index を識別子に使える理由**: `ServiceScore` / `IdeaValidation` は append-only で、
 * 更新・削除のエンドポイントが存在しない(controller に `@Patch` / `@Delete` / `@Put` が無い)。
 * そのため配列の位置は作成後に変化しない。
 */

/** 提案の取得元。FE の DTO でもこの値を使う。 */
export const SUGGESTION_SOURCES = ['DIAGNOSIS', 'IDEA_VALIDATION'] as const;

/** `SUGGESTION_SOURCES` の要素型。 */
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number];

/** 診断・検証を通じた提案の最大件数(両者とも 5)。DTO の index 上限の算出に使う。 */
export const SUGGESTION_MAX_COUNT = Math.max(DIAGNOSIS_MAX_SUGGESTIONS, VALIDATION_MAX_SUGGESTIONS);

/**
 * 保存時の字数上限(`diagnosis-schema.ts` の `SUGGESTION_TITLE_MAX_CHARS` / `SUGGESTION_BODY_MAX_CHARS`)。
 * あちらは private なのでここで独立に持つ。読み出し側でも切ることで、手編集された古い Json 行や
 * 上限変更前のデータに対する二重防御になる。
 */
const TITLE_MAX_CHARS = 60;
const BODY_MAX_CHARS = 500;

/** 保存済み提案が取り得る優先度(`diagnosis-schema.ts` の `SUGGESTION_PRIORITIES` と同値)。 */
const PRIORITIES = new Set(['HIGH', 'MEDIUM', 'LOW']);

/** プロンプトに載せる形に整えた 1 件の提案。axis は日本語ラベルに解決済み。 */
export interface SelectedSuggestion {
  priority: string;
  /** 評価軸の日本語ラベル(例: 「差別化」)。プロンプトでは軸コードより読みやすい。 */
  axisLabel: string;
  title: string;
  body: string;
}

function axisLabelOf(source: SuggestionSource, axis: string): string | undefined {
  if (source === 'DIAGNOSIS') {
    return DIAGNOSIS_AXIS_RUBRIC[axis as DiagnosisAxis]?.label;
  }
  return VALIDATION_AXIS_RUBRIC[axis as ValidationAxis]?.label;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * `suggestions` の Json から `indexes` の位置の提案を取り出す。
 *
 * - Json が配列でない / index が範囲外 / 有効な提案が 0 件 → `BadRequestException`
 * - 個々の要素が壊れている(priority や axis が既知集合外、title / body が空)場合はスキップ
 *
 * 返る順序は `indexes` の順ではなく **元の配列の順**。プロンプト上で優先度の並び
 * (AI は HIGH から順に出力する)が保たれるようにするため。
 */
export function pickSuggestions(
  raw: unknown,
  indexes: readonly number[],
  source: SuggestionSource,
): SelectedSuggestion[] {
  if (!Array.isArray(raw)) {
    throw new BadRequestException('この診断結果には改善提案が保存されていません');
  }

  for (const i of indexes) {
    if (!Number.isInteger(i) || i < 0 || i >= raw.length) {
      throw new BadRequestException(`改善提案の指定が不正です (index: ${i})`);
    }
  }

  // Set で引きつつ元配列の順に走査する(indexes の並び順には依存しない)。
  const wanted = new Set(indexes);
  const selected: SelectedSuggestion[] = [];

  for (let i = 0; i < raw.length; i++) {
    if (!wanted.has(i)) continue;
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const s = item as { priority?: unknown; axis?: unknown; title?: unknown; body?: unknown };

    if (typeof s.priority !== 'string' || !PRIORITIES.has(s.priority)) continue;
    if (typeof s.axis !== 'string') continue;
    const axisLabel = axisLabelOf(source, s.axis);
    if (!axisLabel) continue;
    if (typeof s.title !== 'string' || !s.title.trim()) continue;
    if (typeof s.body !== 'string' || !s.body.trim()) continue;

    selected.push({
      priority: s.priority,
      axisLabel,
      title: truncate(s.title.trim(), TITLE_MAX_CHARS),
      body: truncate(s.body.trim(), BODY_MAX_CHARS),
    });
  }

  if (selected.length === 0) {
    throw new BadRequestException('選択された改善提案を読み取れませんでした');
  }

  return selected;
}
