import {
  Gauge,
  LayoutTemplate,
  Lightbulb,
  ListChecks,
  Megaphone,
  MessageCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * プロジェクト配下の機能(子リソース)の表示メタ。
 *
 * プロジェクト詳細のカードと、各機能ページの見出し・説明が別々に文言を持っていたため
 * 同じ機能の説明が場所ごとに食い違っていた。ここを唯一の出所にする。
 *
 * - `description` … カード用の短い説明
 * - `detail` … 機能ページ用の詳しい説明(未指定なら `description` を使う)
 * - `segment` … `/w/{slug}/projects/{projectId}/{segment}`
 *
 * `lib/api/types.ts` ではなく独立モジュールにしているのは、これが API のレスポンス型ではなく
 * ナビゲーション + コピーの定義だから(`icon` に `LucideIcon` を持つ)。
 */
export type ProjectFeature =
  | 'CHECKLIST'
  | 'RAG_QA'
  | 'ANNOUNCEMENT'
  | 'LANDING_PAGE'
  | 'IDEA_VALIDATION'
  | 'DIAGNOSIS';

interface ProjectFeatureMeta {
  label: string;
  icon: LucideIcon;
  segment: string;
  description: string;
  detail?: string;
  /** Pro / Team 限定機能。カードのバッジと説明末尾の一文に反映する。 */
  planLimited?: boolean;
}

/** Pro / Team 限定機能の説明末尾に付ける一文(機能ページ用)。 */
const PLAN_LIMITED_NOTE = 'Pro / Team 限定機能です。';

export const PROJECT_FEATURE_META: Record<ProjectFeature, ProjectFeatureMeta> = {
  CHECKLIST: {
    label: 'チェックリスト',
    icon: ListChecks,
    segment: 'checklist',
    description: 'リリース前に必要な作業をカテゴリ別に管理します。',
  },
  RAG_QA: {
    label: 'AI 壁打ち',
    icon: MessageCircle,
    segment: 'rag-qa',
    description:
      'プロジェクトの方針や課題を AI と相談します。過去ドキュメントを参照して回答します。',
  },
  ANNOUNCEMENT: {
    label: '告知',
    icon: Megaphone,
    segment: 'announcements',
    description: 'X (Twitter) とブログ向けの告知文を AI で一括生成し、配信状況を管理します。',
  },
  LANDING_PAGE: {
    label: 'ランディングページ',
    icon: LayoutTemplate,
    segment: 'landing-page',
    description: 'AI がブロック構造の LP を生成します。公開 URL で配信できます。',
    detail: 'プロジェクト情報から AI がブロック構造の LP を生成し、公開 URL で配信できます。',
  },
  IDEA_VALIDATION: {
    label: 'アイデア検証',
    icon: Lightbulb,
    segment: 'idea-validations',
    description: 'AI が実競合と比較して Go / Pivot / No-Go を判定します。発案段階の方向性検証に。',
    detail:
      'Lean Startup の Problem-Solution Fit 観点で AI がアイデアを 5 軸スコア化し、Go / Pivot / No-Go の意思決定を支援します。',
    planLimited: true,
  },
  DIAGNOSIS: {
    label: 'プロダクト診断',
    icon: Gauge,
    segment: 'diagnoses',
    description: 'AI が実競合と比較してプロダクトの実用性を 100 点満点でスコア化します。',
    detail:
      '開発中以降のプロジェクトを 5 軸(差別化の実効性 / 対象の到達可能性 / 機能完成度 / リリース準備度 / 競合優位性)で AI がスコア化し、改善提案と競合参照を提示します。',
    planLimited: true,
  },
};

/** 機能ページ用の説明文。`detail` があればそちらを使い、Pro / Team 限定なら一文を足す。 */
export function featurePageDescription(feature: ProjectFeature): string {
  const meta = PROJECT_FEATURE_META[feature];
  const base = meta.detail ?? meta.description;
  return meta.planLimited ? `${base}${PLAN_LIMITED_NOTE}` : base;
}

/** 機能ページの URL。 */
export function featureHref(slug: string, projectId: string, feature: ProjectFeature): string {
  return `/w/${slug}/projects/${projectId}/${PROJECT_FEATURE_META[feature].segment}`;
}
