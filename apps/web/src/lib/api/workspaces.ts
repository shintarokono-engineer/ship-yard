import { cache } from 'react';

import { apiFetch } from './client';
import { ApiError } from './errors';
import type {
  Category,
  ChecklistItem,
  DocType,
  ItemStatus,
  Project,
  ProjectDocument,
  ProjectStatus,
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
