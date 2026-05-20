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

/** `GET /workspaces`(自分の所属一覧)のレスポンス 1 件分。`joinedAt` 付き。 */
export interface MyWorkspaceListItem {
  id: string;
  slug: string;
  name: string;
  plan: Plan;
  role: Role;
  /** TenantMember.joinedAt(ISO8601 文字列)。一覧の並び順は昇順。 */
  joinedAt: string;
}

/** `POST /workspaces`(新規作成)のレスポンス。 */
export interface CreateWorkspaceResult {
  tenant: Workspace;
  /** Stripe Customer + Subscription 初期化に成功したか(失敗時は Checkout 時に lazy 作成)。 */
  subscriptionInitialized: boolean;
}

/**
 * Subscription の課金状態(`SubStatus` enum、packages/db/prisma/schema.prisma)。
 * Stripe 側の status をミラーした値で、Billing 画面で詳細表示に使う。
 */
export const SUB_STATUSES = [
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'INCOMPLETE',
  'TRIALING',
] as const;
export type SubStatus = (typeof SUB_STATUSES)[number];

/**
 * Subscription 状態ごとの表示メタ。Badge variant / 追加 className を直接持つ。
 * PAST_DUE は赤系で注意喚起、TRIALING は青系で進行中、CANCELED は muted。
 */
export const SUB_STATUS_META: Record<
  SubStatus,
  { label: string; badgeVariant: BadgeVariant; badgeClassName?: string }
> = {
  ACTIVE: {
    label: '有効',
    badgeVariant: 'outline',
    badgeClassName:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  PAST_DUE: {
    label: '支払い遅延',
    badgeVariant: 'destructive',
  },
  CANCELED: { label: '解約済み', badgeVariant: 'secondary' },
  INCOMPLETE: {
    label: '初回支払い未完了',
    badgeVariant: 'outline',
    badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  TRIALING: {
    label: 'トライアル中',
    badgeVariant: 'outline',
    badgeClassName: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
};

/**
 * プランごとの表示メタ(ADR-004 と同期)。Billing 画面の現状表示とプラン比較カードで共用する。
 * 価格 / 制限の文言は ADR-004 §4.5 から転記。文言が変わったら ADR と本定義を両方更新する。
 */
export const PLAN_META: Record<
  Plan,
  { label: string; priceLabel: string; tagline: string; limits: readonly string[] }
> = {
  FREE: {
    label: 'Free',
    priceLabel: '¥0',
    tagline: '個人開発のスタート向け',
    limits: ['ワークスペース 1 個', 'メンバー 3 人まで', 'AI 機能 月 20 回まで'],
  },
  PRO: {
    label: 'Pro',
    priceLabel: '¥980 / 月',
    tagline: '本気の個人開発者向け',
    limits: ['ワークスペース無制限', 'メンバー無制限', 'AI 機能無制限'],
  },
  TEAM: {
    label: 'Team',
    priceLabel: '¥2,800 / 人・月',
    tagline: '小規模開発チーム(2〜10 人)向け',
    limits: [
      'Pro のすべて',
      '共同編集 / レビュー',
      '監査ログ',
      '人数課金(メンバー数で自動調整)',
    ],
  },
};

/** `GET /workspaces/:slug/billing` のレスポンス(OWNER のみ閲覧可)。 */
export interface BillingDetail {
  plan: Plan;
  status: SubStatus;
  /** 現課金期間終了日(ISO8601 文字列)。Free / Subscription 未作成は null。 */
  currentPeriodEnd: string | null;
  /** 解約申請日時(ISO8601 文字列)。`status === 'ACTIVE'` と組み合わせて「解約予約中」を判定。 */
  canceledAt: string | null;
}

/**
 * 招待の状態(派生プロパティ、apps/api `invitations.constants.ts` と同期)。
 * 真実の源は `InvitationToken` の `acceptedAt` / `revokedAt` / `expiresAt` 3 列で、API 側で導出する。
 */
export const INVITATION_STATUSES = ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** `GET /invitations/:token`(未認証可)のレスポンス。 */
export interface InvitationDetail {
  email: string;
  role: Role;
  roleLabel: string;
  workspaceName: string;
  workspaceSlug: string;
  inviterName: string;
  /** ISO8601 文字列。 */
  expiresAt: string;
  status: InvitationStatus;
}

/** `POST /invitations/:token/accept` のレスポンス(承諾後、UI が `/w/{slug}` へ遷移するため slug を持つ)。 */
export interface AcceptInvitationResult {
  tenantId: string;
  workspaceSlug: string;
  workspaceName: string;
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

/**
 * AI 生成(DRAFT_GEN)に対応する DocType。apps/api `ai.constants.ts:GENERATABLE_DOC_TYPES` と同期。
 * その他の DocType は `@IsIn(GENERATABLE_DOC_TYPES)` で 400 になるので、UI 側でも型レベルで弾く。
 */
export const GENERATABLE_DOC_TYPES = ['README', 'LANDING_PAGE'] as const satisfies readonly DocType[];
export type GeneratableDocType = (typeof GENERATABLE_DOC_TYPES)[number];

export function isGeneratableDocType(t: DocType): t is GeneratableDocType {
  return (GENERATABLE_DOC_TYPES as readonly DocType[]).includes(t);
}

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
