import { cache } from 'react';

import { apiFetch } from './client';
import { ApiError } from './errors';
import type {
  AnnouncementDetail,
  AnnouncementListItem,
  DeliveryChannel,
} from './types';

/**
 * Announcement(ADR-014)管理 API クライアント。
 *
 * BE 側 `AnnouncementController`(`/workspaces/:slug/projects/:projectId/announcements`)に対応。
 * - 閲覧系(list / fetch)はテナント所属メンバーなら誰でも、書き込み系は WRITER_ROLES。
 * - 詳細取得は `React.cache` でリクエスト内 dedup(layout と page 双方から呼んでも HTTP 1 回)。
 */

const base = (slug: string, projectId: string) =>
  `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/announcements`;

/** `POST .../announcements` — 新規 Announcement(status=DRAFT)を作成。 */
export async function createAnnouncement(
  slug: string,
  projectId: string,
  body: { title: string },
): Promise<AnnouncementDetail> {
  return apiFetch<AnnouncementDetail>(base(slug, projectId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** `GET .../announcements` — 一覧(新しい順、各 Delivery は channel + status のみ)。 */
export async function listAnnouncements(
  slug: string,
  projectId: string,
): Promise<AnnouncementListItem[]> {
  const res = await apiFetch<{ items: AnnouncementListItem[] }>(base(slug, projectId));
  return res.items;
}

/** `GET .../announcements/:id` — 詳細(Delivery 全件含む)。不在 / 他テナント = 404 → null。 */
export const fetchAnnouncement = cache(
  async (
    slug: string,
    projectId: string,
    id: string,
  ): Promise<AnnouncementDetail | null> => {
    try {
      return await apiFetch<AnnouncementDetail>(
        `${base(slug, projectId)}/${encodeURIComponent(id)}`,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
);

/** `PATCH .../announcements/:id` — タイトル / Twitter content 更新。 */
export async function updateAnnouncement(
  slug: string,
  projectId: string,
  id: string,
  body: { title?: string; twitterContent?: { text: string } },
): Promise<AnnouncementDetail> {
  return apiFetch<AnnouncementDetail>(`${base(slug, projectId)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** `DELETE .../announcements/:id` — Announcement + 関連 Delivery / BlogPost を削除。 */
export async function deleteAnnouncement(
  slug: string,
  projectId: string,
  id: string,
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`${base(slug, projectId)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/**
 * `POST .../announcements/:id/generate` — Sonnet 4 で多チャネル文面を生成。
 * 月次クォータ超過は 403、AI 失敗は 502 を投げる(呼び出し側で ApiError 分岐すること)。
 */
export async function generateAnnouncement(
  slug: string,
  projectId: string,
  id: string,
  body: { topic: string; channels?: DeliveryChannel[] },
): Promise<AnnouncementDetail> {
  return apiFetch<AnnouncementDetail>(
    `${base(slug, projectId)}/${encodeURIComponent(id)}/generate`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/**
 * `POST .../announcements/:id/deliveries/:deliveryId/execute` — Delivery 単位の同期実行。
 * Twitter = POST tweet / Blog = publishedAt セット。失敗時は 4xx/5xx と FAILED 状態を保存。
 */
export async function executeDelivery(
  slug: string,
  projectId: string,
  id: string,
  deliveryId: string,
): Promise<AnnouncementDetail> {
  return apiFetch<AnnouncementDetail>(
    `${base(slug, projectId)}/${encodeURIComponent(id)}/deliveries/${encodeURIComponent(deliveryId)}/execute`,
    { method: 'POST' },
  );
}
