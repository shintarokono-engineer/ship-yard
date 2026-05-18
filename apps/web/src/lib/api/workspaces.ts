import { cache } from 'react';

import { apiFetch } from './client';
import { ApiError } from './errors';
import type { Project, ProjectStatus, Workspace } from './types';

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
