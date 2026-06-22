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
export const SUB_STATUSES = ['ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'TRIALING'] as const;
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
 * プランごとの表示メタ(ADR-012 と同期)。Billing 画面の現状表示とプラン比較カードで共用する。
 * 価格 / 制限の文言は ADR-012「決定」節から転記。文言が変わったら ADR と本定義を両方更新する。
 *
 * FREE は「ずっと無料」ではなくトライアル終了後 / 解約後のフォールバック状態(AI 機能停止)。
 * 新規登録時は自動で 7 日 Pro トライアルが付与される。
 */
export const PLAN_META: Record<
  Plan,
  { label: string; priceLabel: string; tagline: string; limits: readonly string[] }
> = {
  FREE: {
    label: 'Free',
    priceLabel: '¥0',
    tagline: 'トライアル終了後 / 解約後の状態',
    limits: [
      'AI 機能は停止',
      'プロジェクト・ドキュメントの閲覧のみ可能',
      'Pro / Team へアップグレードで再開',
    ],
  },
  PRO: {
    label: 'Pro',
    priceLabel: '¥1,480 / 月',
    tagline: '本気の個人開発者向け(7 日無料トライアル)',
    limits: [
      '1 ユーザー',
      'AI クレジット 300 / 月(Haiku 1 cr / Sonnet 3 cr)',
      'Sonnet 4 / Haiku 4.5 自由切替',
      '複数プロジェクト無制限',
      '優先サポート',
    ],
  },
  TEAM: {
    label: 'Team',
    priceLabel: '¥2,800 / 人・月',
    tagline: '2 人以上のチーム向け(7 日無料トライアル)',
    limits: [
      '2 人以上',
      'AI クレジット 800 / 人・月(共有プール)',
      'メンバー招待 + 6 ロール権限',
      '共同編集 / レビュー / 監査ログ',
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

/** 招待発行で指定可能なロール(OWNER 以外)。apps/api `CreateInvitationDto` の `NON_OWNER_ROLES` と同期。 */
export const NON_OWNER_ROLES = [
  'ADMIN',
  'DEVELOPER',
  'REVIEWER',
  'TESTER',
  'VIEWER',
] as const satisfies readonly Role[];
export type NonOwnerRole = (typeof NON_OWNER_ROLES)[number];

/** ロールの日本語ラベル(apps/api `invitations.service.ts:ROLE_LABELS` と同期)。 */
export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'オーナー',
  ADMIN: '管理者',
  DEVELOPER: '開発者',
  REVIEWER: 'レビュワー',
  TESTER: 'テスター',
  VIEWER: '閲覧者',
};

/** `GET /workspaces/:slug/members` のレスポンス 1 件分。 */
export interface Member {
  userId: string;
  role: Role;
  /** ISO8601 文字列。 */
  joinedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

/** `GET /workspaces/:slug/invitations` のレスポンス 1 件分。 */
export interface InvitationListItem {
  id: string;
  email: string;
  role: Role;
  /** ISO8601 文字列。 */
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedBy: { id: string; name: string | null; email: string };
  status: InvitationStatus;
}

/** `POST /workspaces/:slug/invitations` / `.../invitations/:id/resend` のレスポンス。 */
export interface CreateInvitationResult {
  invitation: {
    id: string;
    email: string;
    role: Role;
    /** ISO8601 文字列。 */
    expiresAt: string;
  };
  /** メール送信成功フラグ(false なら UI で「メール送信失敗、再送が必要」と表示)。 */
  mailSent: boolean;
  /** メール送信失敗時の理由(運用切り分け用、MVP では含める)。 */
  mailError?: string;
}

/** `GET /workspaces/:slug/projects[/:id]` のレスポンス 1 件分。 */
export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  launchDate: string | null;
  /** 想定ユーザー(自由補足、ADR-013 改訂版「2 モード化」、Day 44)。 */
  targetUsers: string | null;
  /** 解きたい課題(自由補足、ADR-013 改訂版)。 */
  problemStatement: string | null;
  /** 想定機能リスト(自由補足 Markdown、ADR-013 改訂版)。 */
  proposedFeatures: string | null;
  /** 想定価格モデル(自由補足、ADR-013 改訂版)。 */
  pricingModel: string | null;
  /** プロダクトのドメイン分類(ADR-013 改訂版「構造化入力 v2」、Day 46.5 案 A)。 */
  categoryDomain: CategoryDomain | null;
  /** 課金モデル + 月額レンジを統合した 1 軸(ADR-013 改訂版 v2)。 */
  pricingTier: PricingTier | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  _count: { checklist: number; documents: number };
}

// ============================================================================
// Project 構造化セレクト 2 フィールド(ADR-013 改訂版「構造化入力 v2」、Day 46.5 案 A)
//
// **SSoT 注意**: BE 側 SSoT は `apps/api/src/projects/project-brief.constants.ts`。
// 本セクションは FE 表示用ラベル(`*_LABEL`)を持つ FE 側ミラー定義。
// 値を変更する場合は **BE 側ファイル冒頭コメントに従って 4 箇所を同時更新**すること
// (`packages/shared` への切り出しは v1.x フォローアップ)。
// ============================================================================

/** プロダクトのドメイン分類(B2C / B2B 両対応)。 */
export const CATEGORY_DOMAINS = [
  'ENTERTAINMENT',
  'PRODUCTIVITY',
  'EDUCATION',
  'FINANCE',
  'HEALTH',
  'COMMERCE',
  'SOCIAL',
  'DEVELOPER_TOOL',
  'LIFESTYLE',
  'OTHER',
] as const;
export type CategoryDomain = (typeof CATEGORY_DOMAINS)[number];
export const CATEGORY_DOMAIN_LABEL: Record<CategoryDomain, string> = {
  ENTERTAINMENT: 'エンタメ(ゲーム / 動画 / 音楽 / メディア)',
  PRODUCTIVITY: '生産性(タスク管理 / メモ / コラボ)',
  EDUCATION: '教育(学習 / トレーニング)',
  FINANCE: '金融(家計簿 / 投資 / 決済 / 暗号資産)',
  HEALTH: 'ヘルスケア(フィットネス / 医療 / メンタル)',
  COMMERCE: 'コマース(EC / マーケットプレイス / 課金基盤)',
  SOCIAL: 'ソーシャル(SNS / コミュニティ / マッチング)',
  DEVELOPER_TOOL: '開発者向けツール(CLI / ライブラリ / API)',
  LIFESTYLE: 'ライフスタイル(家事 / 旅行 / 趣味 / 子育て)',
  OTHER: 'その他',
};

/** 課金モデル + 月額レンジを統合した 1 軸。 */
export const PRICING_TIERS = [
  'FREE_ONLY',
  'FREEMIUM_UNDER_1000',
  'FREEMIUM_1000_3000',
  'FREEMIUM_OVER_3000',
  'PAID_UNDER_1000',
  'PAID_1000_3000',
  'PAID_OVER_3000',
  'USAGE_BASED',
  'AD_SUPPORTED',
  'DONATION',
] as const;
export type PricingTier = (typeof PRICING_TIERS)[number];
export const PRICING_TIER_LABEL: Record<PricingTier, string> = {
  FREE_ONLY: '完全無料',
  FREEMIUM_UNDER_1000: 'フリーミアム(〜¥1,000)',
  FREEMIUM_1000_3000: 'フリーミアム(¥1,000〜¥3,000)',
  FREEMIUM_OVER_3000: 'フリーミアム(¥3,000〜)',
  PAID_UNDER_1000: '有料のみ(〜¥1,000)',
  PAID_1000_3000: '有料のみ(¥1,000〜¥3,000)',
  PAID_OVER_3000: '有料のみ(¥3,000〜)',
  USAGE_BASED: '従量課金',
  AD_SUPPORTED: '広告型',
  DONATION: '寄付・スポンサー',
};

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

/**
 * ProjectDocument の種別(`DocType` enum、packages/db/prisma/schema.prisma)。
 *   - `LANDING_PAGE` は §9.12.1(2026-05-28)で enum から削除済(LP は ADR-009 の `LandingPage` 専用テーブルに移行)。
 *   - 告知文(`RELEASE_BLOG` / `TWEET` / `PRODUCT_HUNT` / `EMAIL`)は §9.12.3(2026-05-29)で削除済
 *     (ADR-014 の `Feature.ANNOUNCEMENT_GEN` でマルチチャネル一括生成に移行、`Announcement` + `Delivery` テーブルへ)。
 */
export const DOC_TYPES = ['README', 'OTHER'] as const;
export type DocType = (typeof DOC_TYPES)[number];

/**
 * AI 生成(DRAFT_GEN)に対応する DocType。apps/api `ai.constants.ts:GENERATABLE_DOC_TYPES` と同期。
 * MVP では `README` のみ。
 */
export const GENERATABLE_DOC_TYPES = ['README'] as const satisfies readonly DocType[];
export type GeneratableDocType = (typeof GENERATABLE_DOC_TYPES)[number];

export function isGeneratableDocType(t: DocType): t is GeneratableDocType {
  return (GENERATABLE_DOC_TYPES as readonly DocType[]).includes(t);
}

/** Document の種別ごとの表示メタ。 */
export const DOC_TYPE_META: Record<DocType, { label: string; description: string }> = {
  README: { label: 'README', description: 'プロジェクト概要' },
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

// ----- RAG_QA(プロジェクト壁打ち、ADR-005 Day 27 改訂) -----

/** RagQaMessage の発話者種別(`RagQaRole` enum、packages/db/prisma/schema.prisma と同期)。 */
export const RAG_QA_ROLES = ['USER', 'ASSISTANT'] as const;
export type RagQaRole = (typeof RAG_QA_ROLES)[number];

/** `GET/POST /workspaces/:slug/projects/:projectId/qa/sessions` のセッション 1 件分。 */
export interface RagQaSession {
  id: string;
  projectId: string;
  title: string;
  createdById: string;
  createdAt: string;
  /** メッセージ追加ごとに更新。一覧の並び順(新しい順)の軸。 */
  updatedAt: string;
}

/** RagQaSession 内の 1 メッセージ。`tokensIn` / `tokensOut` / `references` は ASSISTANT のみ非 null。 */
export interface RagQaMessage {
  id: string;
  sessionId: string;
  role: RagQaRole;
  content: string;
  tokensIn: number | null;
  tokensOut: number | null;
  /** この回答が参照した過去ドキュメント(RAG ヒット)のスナップショット。USER メッセージは null。 */
  references: RagQaReference[] | null;
  createdAt: string;
}

/**
 * AI 回答が参照した過去ドキュメント(RAG ヒット)のスナップショット。
 * `RagQaMessage.references` の要素型。BE が `RagQaMessage` 保存時に JSON で永続化する。
 * `isSeed` は運営キュレーション seed コーパス(`SEED_PUBLIC`、ADR-008)由来かどうか。
 */
export interface RagQaReference {
  id: string;
  projectId: string;
  type: DocType;
  title: string;
  /** pgvector の cosine distance(0=完全一致)。 */
  distance: number;
  isSeed: boolean;
}

/** `GET .../qa/sessions/:sessionId` のレスポンス(セッション + メッセージ履歴、古い順)。 */
export interface RagQaSessionDetail {
  session: RagQaSession;
  messages: RagQaMessage[];
}

/**
 * `POST .../qa/sessions/:sessionId/messages` のレスポンス(質問 + AI 回答)。
 * 参照ドキュメントは `assistantMessage.references` に含まれる。
 */
export interface AskRagQaResult {
  userMessage: RagQaMessage;
  assistantMessage: RagQaMessage;
}

// ----- AI 利用状況(設定 → 利用状況タブ、Day 29 API) -----

/** AI 機能種別(`Feature` enum、packages/db/prisma/schema.prisma と同期)。 */
export const FEATURES = [
  'COMPETITOR_RESEARCH',
  'DRAFT_GEN',
  'TASK_SPLIT',
  'RAG_QA',
  'CHECKLIST_GEN',
  'REFINE_DOC',
  'PRODUCT_DIAGNOSIS',
  'IDEA_VALIDATION',
  'ANNOUNCEMENT_GEN',
  'OTHER',
] as const;
export type Feature = (typeof FEATURES)[number];

/**
 * AI 機能ごとの表示メタ(利用状況タブの内訳ラベル)。
 * ラベルは各機能の実画面の名称に合わせる(例: `RAG_QA` の画面見出しは「AI 壁打ち」)。
 * `OTHER` は embedding / RAG 検索など裏方処理で、ユーザー視点の利用回数(`used`)・内訳表示の
 * どちらにも出さない(UI では除外)。Record の網羅性を満たすためキーだけ残す。
 */
export const FEATURE_META: Record<Feature, { label: string }> = {
  COMPETITOR_RESEARCH: { label: '競合調査' },
  DRAFT_GEN: { label: 'ドキュメント生成' },
  TASK_SPLIT: { label: 'タスク分解' },
  RAG_QA: { label: 'AI 壁打ち' },
  CHECKLIST_GEN: { label: 'チェックリスト生成' },
  REFINE_DOC: { label: '文章推敲' },
  PRODUCT_DIAGNOSIS: { label: 'プロダクト診断' },
  IDEA_VALIDATION: { label: 'アイデア検証' },
  ANNOUNCEMENT_GEN: { label: '告知文生成' },
  OTHER: { label: 'その他' },
};

/**
 * AI 機能ごとの 1 回あたり消費クレジット(F7、§9.12.2 観点 7)。
 *
 * BE 側の `apps/api/src/ai/ai.constants.ts` の `MODEL_CREDITS`(Haiku=1 / Sonnet=3)と
 * 各機能で使うモデル + ターン数(IDEA_VALIDATION / PRODUCT_DIAGNOSIS は Day 47.5 で
 * 2-step 化 → ×2)から導出した値を、UI の事前提示用に直接列挙する(SSoT は BE)。
 *
 * 含まれないキー:
 *  - `OTHER`: embedding / RAG 検索などの裏方処理(cr 消費 0)
 *  - `COMPETITOR_RESEARCH`: deprecated(§9.9 で PRODUCT_DIAGNOSIS に統合済)
 */
export const FEATURE_CREDIT_COSTS: Record<
  Exclude<Feature, 'OTHER' | 'COMPETITOR_RESEARCH'>,
  number
> = {
  DRAFT_GEN: 3,
  CHECKLIST_GEN: 1,
  TASK_SPLIT: 1,
  REFINE_DOC: 3,
  RAG_QA: 3,
  IDEA_VALIDATION: 6,
  PRODUCT_DIAGNOSIS: 6,
  /** ADR-014: Sonnet 4 + Tool Use(多チャネル一括)、`FEATURE_CREDIT_OVERRIDES` で override 済。 */
  ANNOUNCEMENT_GEN: 4,
};

/** `GET /workspaces/:slug/usage` のレスポンス(当月のテナント AI 利用状況サマリ、ADR-012)。 */
export interface MonthlyUsageSummary {
  plan: Plan;
  /** 集計対象期間の起点(当月 1 日 00:00 UTC、ISO8601 文字列)。 */
  periodStart: string;
  /** 当月のユーザー視点の AI 利用回数(`Feature.OTHER` 除外、参考値)。 */
  used: number;
  /** 当月の AI クレジット消費量(ADR-012 のプラン上限判定の主軸)。 */
  usedCredits: number;
  /** プラン別の月次クレジット上限。FREE=0(AI 停止)、PRO=300、TEAM=seats×800。 */
  limitCredits: number;
  /** feature 別の内訳(`OTHER` を含む全件、count 降順、各 feature の credits 合計も付与)。 */
  byFeature: { feature: Feature; count: number; credits: number }[];
}

// ----- LandingPage(ADR-009)-----
//
// LP ブロックの型は apps/api `landing-page/lp-blocks.ts` の `LpBlock` 判別ユニオンと一致させる。
// 既存 enum 群と同じく packages/types 共通化は将来課題のため、現状は web 側で重複定義する。

/** LP ブロックの種別(ADR-009 の MVP 5 種 + footer 任意)。 */
export const LP_BLOCK_TYPES = [
  'hero',
  'features',
  'stats',
  'testimonial',
  'cta',
  'footer',
] as const;
export type LpBlockType = (typeof LP_BLOCK_TYPES)[number];

/** ファーストビュー。見出し + サブコピー + CTA ボタン。 */
export interface HeroBlock {
  type: 'hero';
  heading: string;
  sub: string;
  ctaText: string;
  ctaHref: string;
  image?: string;
}

/** 主要機能の紹介。複数の機能項目を持つ。 */
export interface FeaturesBlock {
  type: 'features';
  title: string;
  items: { icon: string; title: string; body: string }[];
}

/** 数値アピール(導入実績・パフォーマンス等)。 */
export interface StatsBlock {
  type: 'stats';
  items: { value: string; label: string }[];
}

/** 利用者の声。 */
export interface TestimonialBlock {
  type: 'testimonial';
  quote: string;
  name: string;
  role: string;
  avatar?: string;
}

/** 行動喚起(ページ下部の CTA)。 */
export interface CtaBlock {
  type: 'cta';
  heading: string;
  buttonText: string;
  buttonHref: string;
}

/** フッター(任意)。 */
export interface FooterBlock {
  type: 'footer';
  copyright: string;
  links: { label: string; href: string }[];
}

/** LP を構成する 1 ブロック(判別ユニオン、`type` で判別)。 */
export type LpBlock =
  | HeroBlock
  | FeaturesBlock
  | StatsBlock
  | TestimonialBlock
  | CtaBlock
  | FooterBlock;

/**
 * LP のカラーテーマ(プリセット、ADR-009 Phase 5a)。apps/api `lp-blocks.ts:LP_THEMES` と一致させる。
 * アクセント色のみを切り替え、レイアウトは不変。
 */
export const LP_THEMES = ['default', 'blue', 'emerald', 'violet', 'rose', 'amber'] as const;
export type LpTheme = (typeof LP_THEMES)[number];

/**
 * `GET /workspaces/:slug/projects/:projectId/landing-page` のレスポンス。
 * 1 プロジェクト = 1 LP(`projectId` は API 側で `@unique`)。
 */
export interface LandingPage {
  id: string;
  projectId: string;
  /** 表示順に並んだブロック配列。 */
  blocks: LpBlock[];
  /** カラーテーマ。API 側で正規化済み(未知値は `default`)。 */
  theme: LpTheme;
  /** 公開日時(ISO8601)。未公開は null。`null` でなければ公開 URL から閲覧可能。 */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `GET /public/landing-pages/:slug/:projectId`(未認証)のレスポンス。
 * 公開済み(`publishedAt != null`)の LP のみ。公開ページ `/p/{slug}/{projectId}` が参照する。
 * OG メタの description は内部フィールドを出さず、hero ブロックの `sub` から web 側で導出する。
 */
export interface PublicLandingPage {
  blocks: LpBlock[];
  /** OG メタ・タイトル用のプロジェクト名。 */
  projectName: string;
  /** カラーテーマ。 */
  theme: LpTheme;
  /** 公開日時(ISO8601)。 */
  publishedAt: string;
}

/** sitemap 生成用の公開済み LP 参照(F10、`/p/{slug}/{projectId}` の最小情報)。 */
export interface PublicLandingPageRef {
  slug: string;
  projectId: string;
  /** 最終公開日時(ISO8601、sitemap の lastModified に使用)。 */
  publishedAt: string;
}

// ============================================================================
// PRODUCT_DIAGNOSIS / IDEA_VALIDATION(ADR-013 + 改訂版「2 モード化」)
// ============================================================================

/** プロダクト診断(PRODUCT_DIAGNOSIS)の評価軸。各 0-20 点 × 5 軸 = 100 点満点。 */
export const DIAGNOSIS_AXES = [
  'differentiation',
  'targetClarity',
  'featureCompleteness',
  'releaseReadiness',
  'competitiveAdvantage',
] as const;
export type DiagnosisAxis = (typeof DIAGNOSIS_AXES)[number];

/** アイデア検証(IDEA_VALIDATION)の評価軸。各 0-20 点 × 5 軸 = 100 点満点。 */
export const VALIDATION_AXES = [
  'problemClarity',
  'targetClarity',
  'differentiation',
  'competitiveAdvantage',
  'marketPotential',
] as const;
export type ValidationAxis = (typeof VALIDATION_AXES)[number];

/** アイデア検証の意思決定支援値。LLM が rubric に従って GO/PIVOT/NO_GO を判定。 */
export const VALIDATION_RECOMMENDATIONS = ['GO', 'PIVOT', 'NO_GO'] as const;
export type ValidationRecommendation = (typeof VALIDATION_RECOMMENDATIONS)[number];

/** 各軸の日本語ラベル(プロダクト診断)。レーダーチャート / 棒グラフ表示用。 */
export const DIAGNOSIS_AXIS_LABEL: Record<DiagnosisAxis, string> = {
  differentiation: '差別化',
  targetClarity: 'ターゲット明確性',
  featureCompleteness: '機能完成度',
  releaseReadiness: 'リリース準備度',
  competitiveAdvantage: '競合優位性',
};

/** 各軸の日本語ラベル(アイデア検証)。 */
export const VALIDATION_AXIS_LABEL: Record<ValidationAxis, string> = {
  problemClarity: '問題明確性',
  targetClarity: 'ターゲット明確性',
  differentiation: '差別化',
  competitiveAdvantage: '競合優位性',
  marketPotential: '市場性',
};

/** recommendation の表示メタ(色 + 日本語ラベル + アクション説明)。 */
export const VALIDATION_RECOMMENDATION_META: Record<
  ValidationRecommendation,
  { label: string; description: string; tone: 'positive' | 'neutral' | 'negative' }
> = {
  GO: { label: 'GO', description: '明確に進めるべきアイデア', tone: 'positive' },
  PIVOT: { label: 'PIVOT', description: '方向修正で改善余地あり', tone: 'neutral' },
  NO_GO: { label: 'NO_GO', description: '根本的に再検討推奨', tone: 'negative' },
};

/** 5 軸ブレークダウン(プロダクト診断 / アイデア検証 で共通の構造)。 */
export type ScoreBreakdown<A extends string = string> = Record<
  A,
  { score: number; comment: string }
>;

/** 改善提案 1 件。優先度 + どの軸を改善するかを紐付け。 */
export interface Suggestion<A extends string = string> {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 提案のタイトル(1 行、60 文字以内)。 */
  title: string;
  /** 提案の詳細(Markdown 可、500 文字以内)。 */
  body: string;
  /** どの軸を改善するか(DiagnosisAxis または ValidationAxis)。 */
  axis: A;
}

/** 競合プロダクトのスナップショット(Web Search で取得した実競合の参照)。 */
export interface CompetitorRef {
  name: string;
  /** 公式 URL(safeHref で javascript: 等を無害化、ADR-009 / 013 パターン)。 */
  url: string;
  /** Web Search で取得した概要(300 文字以内に切り詰め済)。 */
  summary: string;
  /** 本プロダクトとの類似性メモ(Sonnet が生成、200 文字以内)。 */
  similarityNote: string;
}

/** プロダクト診断の結果(`GET /workspaces/:slug/projects/:projectId/diagnoses/:id` 等)。 */
export interface ServiceScore {
  id: string;
  tenantId: string;
  projectId: string;
  /** 総合スコア(0-100、breakdown 合計と整合性アサート済)。 */
  totalScore: number;
  /** 5 軸ブレークダウン。 */
  breakdown: ScoreBreakdown<DiagnosisAxis>;
  /** 改善提案 3-5 件。 */
  suggestions: Suggestion<DiagnosisAxis>[];
  /** 競合参照 0-5 件(Web Search 失敗時 / 無効時は空配列)。 */
  competitorRefs: CompetitorRef[];
  /** Web Search Tool を使ったか(LLM 知識ベース fallback 時は false)。 */
  webSearchUsed: boolean;
  /** 使用したモデル ID(AI_MODEL_SONNET の値)。 */
  modelUsed: string;
  createdById: string;
  /** 診断実行日時(ISO8601、履歴比較の主軸)。 */
  createdAt: string;
}

/** アイデア検証の結果(`GET /workspaces/:slug/projects/:projectId/idea-validations/:id` 等)。 */
export interface IdeaValidation {
  id: string;
  tenantId: string;
  projectId: string;
  /** 総合スコア(0-100、breakdown 合計と整合性アサート済)。 */
  totalScore: number;
  /** Lean Startup 意思決定支援('GO' | 'PIVOT' | 'NO_GO')。 */
  recommendation: ValidationRecommendation;
  /** 5 軸ブレークダウン(アイデア段階固有の軸)。 */
  breakdown: ScoreBreakdown<ValidationAxis>;
  /** 改善提案 3-5 件(Pivot 候補 / ターゲット絞り込み系が中心)。 */
  suggestions: Suggestion<ValidationAxis>[];
  /** 競合参照 0-5 件。 */
  competitorRefs: CompetitorRef[];
  webSearchUsed: boolean;
  modelUsed: string;
  createdById: string;
  createdAt: string;
}

/** suggestion.priority の表示メタ(色 + ラベル、UI のバッジで使う)。 */
export const SUGGESTION_PRIORITY_META: Record<
  Suggestion['priority'],
  { label: string; tone: 'negative' | 'neutral' | 'positive' }
> = {
  HIGH: { label: 'HIGH', tone: 'negative' },
  MEDIUM: { label: 'MEDIUM', tone: 'neutral' },
  LOW: { label: 'LOW', tone: 'positive' },
};

// ============================================================
// ADR-014: Announcement / BlogPost / Twitter Integration
// ============================================================

/** Announcement のライフサイクル状態(`AnnouncementStatus` enum と同期、ADR-014)。 */
export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'READY', 'EXECUTING', 'DONE'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

/** Delivery のチャネル(`DeliveryChannel` enum と同期、ADR-014)。 */
export const DELIVERY_CHANNELS = ['TWITTER', 'BLOG'] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

/**
 * Delivery の配信状態(`DeliveryStatus` enum と同期、ADR-014、packages/db/prisma/schema.prisma)。
 *
 * SCHEDULED は MVP では UI から触れないが、enum 値として schema に存在するため網羅する
 * (v1.x で予約投稿対応時に UI を追加する想定)。
 */
export const DELIVERY_STATUSES = ['DRAFT', 'SCHEDULED', 'SENT', 'FAILED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Announcement.status の表示メタ(UI Badge 用、ADR-014)。 */
export const ANNOUNCEMENT_STATUS_META: Record<
  AnnouncementStatus,
  { label: string; badgeVariant: BadgeVariant; badgeClassName?: string }
> = {
  DRAFT: { label: '下書き', badgeVariant: 'secondary' },
  READY: { label: '配信準備完了', badgeVariant: 'outline' },
  EXECUTING: {
    label: '配信中',
    badgeVariant: 'outline',
    badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  DONE: {
    label: '配信済み',
    badgeVariant: 'outline',
    badgeClassName:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
};

/** Delivery.status の表示メタ(UI Badge 用、ADR-014)。 */
export const DELIVERY_STATUS_META: Record<
  DeliveryStatus,
  { label: string; badgeVariant: BadgeVariant; badgeClassName?: string }
> = {
  DRAFT: { label: '下書き', badgeVariant: 'secondary' },
  SCHEDULED: {
    label: '予約済み',
    badgeVariant: 'outline',
    badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  SENT: {
    label: '配信成功',
    badgeVariant: 'outline',
    badgeClassName:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  FAILED: { label: '配信失敗', badgeVariant: 'destructive' },
};

/** Delivery channel の表示メタ(UI ラベル / アイコン用、ADR-014)。 */
export const DELIVERY_CHANNEL_META: Record<DeliveryChannel, { label: string }> = {
  TWITTER: { label: 'X (Twitter)' },
  BLOG: { label: 'ブログ' },
};

/**
 * Announcement / BlogPost のフォーム制約定数(apps/api `announcement.constants.ts` と同期)。
 * FE の入力長制限・カウンタ表示用。BE と同値を維持すること(乖離するとサーバーバリデーションで弾かれる)。
 */
export const TWITTER_TEXT_MAX = 280;
export const BLOG_TITLE_MAX = 120;
export const BLOG_BODY_MIN = 100;
export const BLOG_BODY_MAX = 20000;
export const BLOG_SUMMARY_MAX = 200;
export const BLOG_SLUG_MAX = 80;
export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_TOPIC_MAX = 500;

/** Delivery.content の TWITTER ペイロード(ADR-014、`announcement-types.ts` と同期)。 */
export interface TwitterDeliveryContent {
  text: string;
}

/** Delivery.content の BLOG ペイロード(BlogPost 本体は別 entity、ADR-014)。 */
export interface BlogDeliveryContent {
  blogPostId: string;
  summary: string;
}

/** Delivery 1 件(channel ごとに content の shape が異なる、TWITTER / BLOG)。 */
export interface Delivery {
  id: string;
  announcementId: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  /** channel に応じて TwitterDeliveryContent | BlogDeliveryContent。Json 型のため呼び出し側で narrow する。 */
  content: TwitterDeliveryContent | BlogDeliveryContent | Record<string, unknown>;
  sentAt: string | null;
  externalRef: string | null;
  error: string | null;
  executedById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /workspaces/:slug/projects/:projectId/announcements` の 1 件分(Delivery は channel/status のみ)。 */
export interface AnnouncementListItem {
  id: string;
  title: string;
  status: AnnouncementStatus;
  createdAt: string;
  deliveries: Array<{ channel: DeliveryChannel; status: DeliveryStatus }>;
}

/** 詳細(`GET .../announcements/:id`、Delivery 全件含む)。 */
export interface AnnouncementDetail {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  status: AnnouncementStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  deliveries: Delivery[];
}

/** BlogPost(管理 UI 用、編集画面で扱う全フィールド)。 */
export interface BlogPost {
  id: string;
  tenantId: string;
  projectId: string;
  deliveryId: string | null;
  slug: string;
  title: string;
  body: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 公開 API レスポンス(`GET /public/blog-posts/:slug/:projectId/:postSlug`、内部フィールド除外)。 */
export interface PublicBlogPost {
  title: string;
  body: string;
  slug: string;
  publishedAt: string;
  project: { id: string; name: string };
  tenant: { slug: string };
}

/** 連携済 Twitter アカウント(`GET /workspaces/:slug/integrations/twitter`、token は含まない)。 */
export interface TwitterAccount {
  id: string;
  handle: string;
  xUserId: string;
  connectedById: string;
  expiresAt: string;
  createdAt: string;
  scopes: string[];
}
