import { cache } from 'react';

import { apiFetch } from './client';
import { ApiError } from './errors';
import type {
  AskRagQaResult,
  Category,
  ChecklistItem,
  CreateWorkspaceResult,
  DocType,
  GeneratableDocType,
  ItemStatus,
  LandingPage,
  LpBlock,
  LpTheme,
  MonthlyUsageSummary,
  MyWorkspaceListItem,
  Project,
  ProjectDocument,
  ProjectStatus,
  PublicLandingPage,
  RagQaSession,
  RagQaSessionDetail,
  Workspace,
} from './types';

/**
 * 現在のユーザーが所属する slug の Workspace を取得する。
 *
 * 所属していない / slug 不在の場合は API が 404 を返すので、ここでは null に変換する
 * (呼び出し側で `notFound()` する想定)。
 *
 * `React.cache` でラップしてあるので、同一リクエスト内で layout と page から重複して
 * 呼ばれても apps/api への HTTP 通信は 1 回しか走らない。
 */
export const fetchWorkspace = cache(async (slug: string): Promise<Workspace | null> => {
  try {
    return await apiFetch<Workspace>(`/workspaces/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 401)) return null;
    throw e;
  }
});

/**
 * `GET /workspaces` — 自分が所属する全 workspace を `joinedAt` 昇順で返す。
 *
 * オンボーディング判定とルート `/` での所属 fallback 用。`React.cache` で同一リクエスト内 dedup。
 * 未認証 / User 行未同期は空配列(API 側で空配列を返す設計)。
 */
export const listMyWorkspaces = cache(async (): Promise<MyWorkspaceListItem[]> => {
  try {
    return await apiFetch<MyWorkspaceListItem[]>('/workspaces');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return [];
    throw e;
  }
});

/**
 * `POST /workspaces` — 新規ワークスペース作成。
 *
 * `slug` は省略可:省略時は `name` から自動生成(衝突時は API 側で `-2`, `-3`, ... を付与)。
 * 成功時は `{ tenant: { slug, ... }, subscriptionInitialized }` を返すので呼び出し側で `/w/{slug}` へ遷移する。
 */
export async function createWorkspace(body: {
  name: string;
  slug?: string;
}): Promise<CreateWorkspaceResult> {
  return apiFetch<CreateWorkspaceResult>('/workspaces', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * `GET /workspaces/:slug/usage` — 当月のテナント AI 利用状況サマリ。
 *
 * `@Roles` なし = 全テナントメンバーが閲覧可(課金・上限の透明性をメンバー全員に見せる方針)。
 * 所属していない / slug 不在は `WorkspaceGuard` が 404 を返す(親 layout が所属判定済みの想定)。
 */
export async function fetchUsage(slug: string): Promise<MonthlyUsageSummary> {
  return apiFetch<MonthlyUsageSummary>(`/workspaces/${encodeURIComponent(slug)}/usage`);
}

/** `GET /workspaces/:slug/projects[?status=...]` */
export async function listProjects(slug: string, status?: ProjectStatus): Promise<Project[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch<Project[]>(`/workspaces/${encodeURIComponent(slug)}/projects${query}`);
}

/** `POST /workspaces/:slug/projects` */
export async function createProject(
  slug: string,
  body: {
    name: string;
    description?: string;
    status?: ProjectStatus;
    launchDate?: string;
  },
): Promise<Project> {
  return apiFetch<Project>(`/workspaces/${encodeURIComponent(slug)}/projects`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * `GET /workspaces/:slug/projects/:projectId`
 *
 * 所属していない / slug / projectId 不在は 404(`notFound()` する想定で null に変換)。
 * `React.cache` でラップしてあるので、同一リクエスト内で重複呼び出しは 1 回に dedup される。
 */
export const fetchProject = cache(
  async (slug: string, projectId: string): Promise<Project | null> => {
    try {
      return await apiFetch<Project>(
        `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}`,
      );
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 401)) return null;
      throw e;
    }
  },
);

/**
 * `PATCH /workspaces/:slug/projects/:projectId`
 *
 * 部分更新。`description` / `launchDate` は `null` 明示で nullable 列をクリアできる
 * (apps/api 側 `UpdateProjectDto` のセマンティクスと同じ)。`undefined` は body から
 * 落ちて「既存値を保持」になる。
 */
export async function updateProject(
  slug: string,
  projectId: string,
  body: {
    name?: string;
    description?: string | null;
    status?: ProjectStatus;
    launchDate?: string | null;
  },
): Promise<Project> {
  return apiFetch<Project>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

/**
 * `DELETE /workspaces/:slug/projects/:projectId`
 *
 * 成功時は 204 No Content(`apiFetch` が `undefined` を返す)。
 * 子リソース(ChecklistItem / ProjectDocument)が連鎖削除されるため `ADMIN_ROLES` 必須。
 */
export async function deleteProject(slug: string, projectId: string): Promise<void> {
  await apiFetch<void>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}`,
    { method: 'DELETE' },
  );
}

// ----- ChecklistItem -----

/**
 * `GET /workspaces/:slug/projects/:projectId/checklist[?category=...]`
 *
 * position 昇順で返る。`parentId` 含むので呼び出し側で親→サブの階層グルーピングが可能。
 */
export async function listChecklist(
  slug: string,
  projectId: string,
  category?: Category,
): Promise<ChecklistItem[]> {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  return apiFetch<ChecklistItem[]>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/checklist${query}`,
  );
}

/** `POST /workspaces/:slug/projects/:projectId/checklist` */
export async function createChecklistItem(
  slug: string,
  projectId: string,
  body: {
    category: Category;
    title: string;
    description?: string;
    status?: ItemStatus;
    position?: number;
    /** 同一プロジェクトのトップレベル項目 ID。指定するとサブタスクとして紐付く(2 階層まで)。 */
    parentId?: string;
  },
): Promise<ChecklistItem> {
  return apiFetch<ChecklistItem>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/checklist`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/**
 * `PATCH /workspaces/:slug/projects/:projectId/checklist/:itemId`
 *
 * 部分更新。`description` は `null` 明示で nullable 列をクリアできる
 * (apps/api `UpdateChecklistItemDto` のセマンティクス)。
 * `parentId` は update 経由では変更不可(ADR-005、サブタスク作成は新規 create で行う)。
 */
export async function updateChecklistItem(
  slug: string,
  projectId: string,
  itemId: string,
  body: {
    category?: Category;
    title?: string;
    description?: string | null;
    status?: ItemStatus;
    position?: number;
  },
): Promise<ChecklistItem> {
  return apiFetch<ChecklistItem>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/checklist/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

/**
 * `DELETE /workspaces/:slug/projects/:projectId/checklist/:itemId`
 *
 * 成功時は 204 No Content。サブタスク(`parentId` 経由の子)は API 側で Cascade 削除される。
 */
export async function deleteChecklistItem(
  slug: string,
  projectId: string,
  itemId: string,
): Promise<void> {
  await apiFetch<void>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/checklist/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  );
}

// ----- ProjectDocument -----

/**
 * `GET /workspaces/:slug/projects/:projectId/documents[?type=...]`
 *
 * 一覧は本文(content)を含まない設計(API 側で 200KB 級を毎回返さないため)。
 * 各 type で複数 version が並ぶことに注意(version 履歴の元データ)。
 */
export async function listDocuments(
  slug: string,
  projectId: string,
  type?: DocType,
): Promise<ProjectDocument[]> {
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  return apiFetch<ProjectDocument[]>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/documents${query}`,
  );
}

/**
 * `GET /workspaces/:slug/projects/:projectId/documents/:documentId`
 *
 * 本文込みで 1 件取得。soft delete 済みは 404 → null。
 * `React.cache` で同一リクエスト内の dedup。
 */
export const fetchDocument = cache(
  async (slug: string, projectId: string, documentId: string): Promise<ProjectDocument | null> => {
    try {
      return await apiFetch<ProjectDocument>(
        `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`,
      );
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 401)) return null;
      throw e;
    }
  },
);

/**
 * `PATCH /workspaces/:slug/projects/:projectId/documents/:documentId`
 *
 * **append-only**: 既存行は変更されず、同 (projectId, type) で `MAX(version)+1` の新行が
 * 作られて返る。`title` / `content` の少なくとも一方が必要(両方欠落で 400)。
 */
export async function editDocument(
  slug: string,
  projectId: string,
  documentId: string,
  body: { title?: string; content?: string },
): Promise<ProjectDocument> {
  return apiFetch<ProjectDocument>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

/**
 * `DELETE /workspaces/:slug/projects/:projectId/documents/:documentId`
 *
 * 行単位 soft delete(`deletedAt` に UTC now)。204 No Content。
 * 2 回目の DELETE は 404(明示性優先、冪等性ではない)。
 */
export async function deleteDocument(
  slug: string,
  projectId: string,
  documentId: string,
): Promise<void> {
  await apiFetch<void>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`,
    { method: 'DELETE' },
  );
}

// ----- AI generate -----

/**
 * `POST /workspaces/:slug/projects/:projectId/documents/generate`
 *
 * Sonnet 4 + Tool Use で README / LP の本文を生成し、新規 ProjectDocument(v1 または新 version)
 * として保存して返す。**append-only**:同 type が既存でも version+1 として並列に積まれる。
 * Free プランは月 20 回上限(達成時 403 + メッセージに「AI 利用上限」)。
 */
export async function generateDocument(
  slug: string,
  projectId: string,
  body: { docType: GeneratableDocType; instructions?: string },
): Promise<ProjectDocument> {
  return apiFetch<ProjectDocument>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/documents/generate`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/**
 * `POST /workspaces/:slug/projects/:projectId/checklist/generate`
 *
 * Haiku 4.5 + Tool Use で最大 30 件の ChecklistItem を `createManyAndReturn` で一括生成。
 * Project の name / description / status を API 側で自動的に context に含めるので、ここに
 * 改めて渡す必要は無い。`categories` は未指定で全カテゴリ、空配列は 400。
 */
export async function generateChecklist(
  slug: string,
  projectId: string,
  body: { instructions?: string; categories?: Category[] },
): Promise<{ items: ChecklistItem[] }> {
  return apiFetch<{ items: ChecklistItem[] }>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/checklist/generate`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/**
 * `POST /workspaces/:slug/projects/:projectId/checklist/:itemId/split`
 *
 * Haiku 4.5 + Tool Use で親 ChecklistItem を最大 10 件のサブタスクに分解(TASK_SPLIT、Day 15)。
 * 生成された子タスクは親 Category を継承し、`parentId` 紐付けで既存項目の末尾に追加される
 * (append-only、元タスクは変更しない)。Free プランは月 20 回上限。
 */
export async function splitChecklistItem(
  slug: string,
  projectId: string,
  itemId: string,
  body: { instructions?: string },
): Promise<{ items: ChecklistItem[] }> {
  return apiFetch<{ items: ChecklistItem[] }>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/checklist/${encodeURIComponent(itemId)}/split`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/**
 * `POST /workspaces/:slug/projects/:projectId/documents/:documentId/refine`
 *
 * Sonnet 4 + Tool Use で既存 ProjectDocument の title/content を推敲し、`DocumentsService.edit`
 * 経由で **append-only に新版**(`MAX(version)+1`)を作成して返す(REFINE_DOC、Day 14)。
 * 既存版の id とは別の id が返るので、呼び出し側は新版の URL に redirect する想定。
 * Free プランは月 20 回上限。
 */
export async function refineDocument(
  slug: string,
  projectId: string,
  documentId: string,
  body: { goal?: string },
): Promise<ProjectDocument> {
  return apiFetch<ProjectDocument>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/refine`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

// ----- RAG_QA(プロジェクト壁打ち、ADR-005 Day 27 改訂) -----

/**
 * `GET /workspaces/:slug/projects/:projectId/qa/sessions`
 *
 * 壁打ちセッション一覧を `updatedAt` 降順(新しい順)で返す。全テナントメンバーが閲覧可。
 */
export async function listRagQaSessions(slug: string, projectId: string): Promise<RagQaSession[]> {
  return apiFetch<RagQaSession[]>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/qa/sessions`,
  );
}

/**
 * `POST /workspaces/:slug/projects/:projectId/qa/sessions`
 *
 * 新規セッションを作成。`title` は 1〜100 文字。WRITER_ROLES のみ(REVIEWER 等は 403)。
 */
export async function createRagQaSession(
  slug: string,
  projectId: string,
  body: { title: string },
): Promise<RagQaSession> {
  return apiFetch<RagQaSession>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/qa/sessions`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/**
 * `GET /workspaces/:slug/projects/:projectId/qa/sessions/:sessionId`
 *
 * セッション + メッセージ履歴(古い順)を取得。不在 / 越境は 404 → null。
 * `React.cache` で同一リクエスト内の dedup。
 */
export const fetchRagQaSession = cache(
  async (
    slug: string,
    projectId: string,
    sessionId: string,
  ): Promise<RagQaSessionDetail | null> => {
    try {
      return await apiFetch<RagQaSessionDetail>(
        `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/qa/sessions/${encodeURIComponent(sessionId)}`,
      );
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 401)) return null;
      throw e;
    }
  },
);

/**
 * `POST /workspaces/:slug/projects/:projectId/qa/sessions/:sessionId/messages`
 *
 * 質問を送信し Sonnet 4 で回答を生成。user / assistant メッセージと参照ドキュメント(RAG ヒット)を返す。
 * WRITER_ROLES のみ。Free プランは月 20 回上限(超過時 403 + 「AI 利用上限」)。
 */
export async function askRagQaMessage(
  slug: string,
  projectId: string,
  sessionId: string,
  body: { question: string },
): Promise<AskRagQaResult> {
  return apiFetch<AskRagQaResult>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/qa/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

// ----- LandingPage(ADR-009)-----

/**
 * `GET /workspaces/:slug/projects/:projectId/landing-page`
 *
 * プロジェクトの LP(ブロック構造)を取得。LP 未生成 / プロジェクト不在は 404 → null。
 * 呼び出し側は先に `fetchProject` で 404→`notFound()` 済みの想定なので、ここでの null は
 * 「プロジェクトは存在するが LP 未生成」を意味する。`React.cache` で同一リクエスト内 dedup。
 */
export const fetchLandingPage = cache(
  async (slug: string, projectId: string): Promise<LandingPage | null> => {
    try {
      return await apiFetch<LandingPage>(
        `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/landing-page`,
      );
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 401)) return null;
      throw e;
    }
  },
);

/**
 * `POST /workspaces/:slug/projects/:projectId/landing-page/generate`
 *
 * Sonnet 4 + Tool Use(`submit_landing_page`)で LP をブロック構造として生成し、`LandingPage`
 * に upsert して返す。1 プロジェクト = 1 LP のため、既存 LP があれば上書き(再生成)。
 * Free プランは月 20 回上限(達成時 403 + メッセージに「AI 利用上限」)。
 */
export async function generateLandingPage(
  slug: string,
  projectId: string,
  body: { instructions?: string },
): Promise<LandingPage> {
  return apiFetch<LandingPage>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/landing-page/generate`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/**
 * `PUT /workspaces/:slug/projects/:projectId/landing-page`
 *
 * LP のブロック配列とカラーテーマをまるごと差し替える
 * (AI 呼び出しなし)。WRITER_ROLES のみ。LP 未生成のプロジェクトは 404、blocks が空 / 不正なら 400。
 */
export async function updateLandingPage(
  slug: string,
  projectId: string,
  body: { blocks: LpBlock[]; theme: LpTheme },
): Promise<LandingPage> {
  return apiFetch<LandingPage>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/landing-page`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}

/**
 * `PATCH /workspaces/:slug/projects/:projectId/landing-page/publish`
 *
 * LP の公開状態を切り替える(Day 33)。`published=true` で公開 URL `/p/{slug}/{projectId}` から
 * 未認証でも閲覧可能になる。WRITER_ROLES のみ。LP 未生成は 404。
 */
export async function setLandingPagePublished(
  slug: string,
  projectId: string,
  published: boolean,
): Promise<LandingPage> {
  return apiFetch<LandingPage>(
    `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/landing-page/publish`,
    {
      method: 'PATCH',
      body: JSON.stringify({ published }),
    },
  );
}

/**
 * `GET /public/landing-pages/:slug/:projectId`(未認証)
 *
 * 公開 URL `/p/{slug}/{projectId}` ページが参照する公開 LP の取得。`publishedAt` がセットされた
 * LP のみ返り、未公開 / 未生成 / 不在はすべて 404 → null。`skipAuth` で Clerk トークンを付けない。
 * `React.cache` で同一リクエスト内(`generateMetadata` と本体)の dedup。
 */
export const fetchPublicLandingPage = cache(
  async (slug: string, projectId: string): Promise<PublicLandingPage | null> => {
    try {
      return await apiFetch<PublicLandingPage>(
        `/public/landing-pages/${encodeURIComponent(slug)}/${encodeURIComponent(projectId)}`,
        { skipAuth: true },
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
);
