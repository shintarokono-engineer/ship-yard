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
