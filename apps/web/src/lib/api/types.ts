// API レスポンス型(apps/api のレスポンス shape と一致させる)。
//
// TODO(packages/types): 以下の enum 文字列群は packages/db の Prisma enum と
// 一致させる必要がある。本来は packages/types 共通化が望ましいが、apps/api 側で
// 並行作業中(Day 14, REFINE_DOC)のため衝突回避を優先し、現状は web 側で重複定義
// している。enum が増えた段階で packages/types 整備をフォローアップタスク化する。

/** テナントの課金プラン(`Plan` enum、packages/db/prisma/schema.prisma)。 */
export const PLANS = ['FREE', 'PRO', 'TEAM'] as const;
export type Plan = (typeof PLANS)[number];

/** メンバーロール(`Role` enum、packages/db/prisma/schema.prisma)。 */
export const ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'REVIEWER', 'TESTER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

/**
 * 書き込み権限を持つロール一覧(apps/api の `WRITER_ROLES` と同期)。
 * プロジェクト作成・編集・チェックリスト追加など、コンテンツの作成更新に必要なロール。
 */
export const WRITER_ROLES: readonly Role[] = ['OWNER', 'ADMIN', 'DEVELOPER'];

/**
 * 管理権限を持つロール一覧(apps/api の `ADMIN_ROLES` と同期)。
 * プロジェクト削除など、子リソースが連鎖削除される破壊的操作・メンバー管理に必要。
 */
export const ADMIN_ROLES: readonly Role[] = ['OWNER', 'ADMIN'];

/** メンバーロールが書き込み権限を持つかを判定。 */
export function isWriterRole(role: Role): boolean {
  return (WRITER_ROLES as readonly string[]).includes(role);
}

/** メンバーロールが管理権限を持つかを判定。 */
export function isAdminRole(role: Role): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

/** プロジェクトのライフサイクル状態(`ProjectStatus` enum と同期)。 */
export const PROJECT_STATUSES = ['IDEA', 'IN_DEV', 'BETA', 'LAUNCHED', 'ARCHIVED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Badge コンポーネントが受け付けるバリアント(shadcn `badge.tsx` と一致)。 */
export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

/**
 * プロジェクト状態ごとの表示メタ。Badge の variant と必要に応じた追加 className を直接持つ。
 * 視覚的に区別が必要な BETA / LAUNCHED は配色を分離。
 */
export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; badgeVariant: BadgeVariant; badgeClassName?: string }
> = {
  IDEA: { label: 'アイデア', badgeVariant: 'outline' },
  IN_DEV: { label: '開発中', badgeVariant: 'default' },
  BETA: {
    label: 'ベータ',
    badgeVariant: 'outline',
    badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  LAUNCHED: {
    label: 'リリース済み',
    badgeVariant: 'outline',
    badgeClassName:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  ARCHIVED: { label: 'アーカイブ', badgeVariant: 'secondary' },
};

/** `GET /workspaces/:slug` のレスポンス。 */
export interface Workspace {
  id: string;
  slug: string;
  name: string;
  plan: Plan;
  role: Role;
}

/** `GET /workspaces/:slug/projects[/:id]` のレスポンス 1 件分。 */
export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  launchDate: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  _count: { checklist: number; documents: number };
}

/** ChecklistItem のカテゴリ(`Category` enum、packages/db/prisma/schema.prisma)。 */
export const CATEGORIES = ['TECH', 'LEGAL', 'MARKETING', 'UX', 'OTHER'] as const;
export type Category = (typeof CATEGORIES)[number];

/** ChecklistItem の進捗状態(`ItemStatus` enum)。 */
export const ITEM_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** カテゴリの表示ラベル。 */
export const CATEGORY_META: Record<Category, { label: string }> = {
  TECH: { label: '技術' },
  LEGAL: { label: '法務' },
  MARKETING: { label: 'マーケティング' },
  UX: { label: 'UX' },
  OTHER: { label: 'その他' },
};

/** 進捗状態の表示ラベル + バッジ。 */
export const ITEM_STATUS_META: Record<
  ItemStatus,
  { label: string; badgeVariant: BadgeVariant; badgeClassName?: string }
> = {
  TODO: { label: '未着手', badgeVariant: 'outline' },
  IN_PROGRESS: {
    label: '着手中',
    badgeVariant: 'outline',
    badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  DONE: {
    label: '完了',
    badgeVariant: 'outline',
    badgeClassName:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  NOT_APPLICABLE: { label: '該当なし', badgeVariant: 'secondary' },
};

/** `GET /workspaces/:slug/projects/:projectId/checklist` のレスポンス 1 件分。 */
export interface ChecklistItem {
  id: string;
  projectId: string;
  /** TASK_SPLIT で生成された子サブタスクのみセット。手動作成は null。 */
  parentId: string | null;
  category: Category;
  title: string;
  description: string | null;
  status: ItemStatus;
  position: number;
  createdAt: string;
}

/** ProjectDocument の種別(`DocType` enum、packages/db/prisma/schema.prisma)。 */
export const DOC_TYPES = [
  'README',
  'LANDING_PAGE',
  'RELEASE_BLOG',
  'TWEET',
  'PRODUCT_HUNT',
  'EMAIL',
  'OTHER',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Document の種別ごとの表示メタ。 */
export const DOC_TYPE_META: Record<DocType, { label: string; description: string }> = {
  README: { label: 'README', description: 'プロジェクト概要' },
  LANDING_PAGE: { label: 'ランディングページ', description: '訴求 / ファーストビュー' },
  RELEASE_BLOG: { label: 'リリースブログ', description: '公開時の記事' },
  TWEET: { label: 'X / Twitter 告知文', description: '短文告知' },
  PRODUCT_HUNT: { label: 'Product Hunt 投稿', description: 'PH ローンチ用テキスト' },
  EMAIL: { label: '告知メール', description: 'メーリングリスト用本文' },
  OTHER: { label: 'その他', description: '汎用ドキュメント' },
};

/**
 * `GET /workspaces/:slug/projects/:projectId/documents` のレスポンス 1 件分。
 * 一覧 API は `content` を含まず、1 件取得 API のみ `content` 込みで返る。
 */
export interface ProjectDocument {
  id: string;
  projectId: string;
  type: DocType;
  title: string;
  /** 一覧 API では含まれない(null として表現)、1 件取得 API でのみ本文が入る。 */
  content: string | null;
  /** 推敲履歴の version 番号。同 (projectId, type) で v1, v2, ... と増加。 */
  version: number;
  createdById: string;
  createdAt: string;
  /** soft delete されたタイムスタンプ。一覧 / 取得 API ではそもそも 404 になるので null 想定。 */
  deletedAt: string | null;
}
