import Link from 'next/link';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { Project, Workspace } from '@/lib/api/types';
import { featureHref, PROJECT_FEATURE_META, type ProjectFeature } from '@/lib/project-features';

/**
 * `ワークスペース / プロジェクト / 機能 / 個別リソース` のパンくず。
 *
 * 従来は各ページが `◯◯ へ戻る` のリンクを直書きしており、
 * 「テスト の詳細へ戻る」「テスト へ戻る」「壁打ち一覧へ戻る」と文言が揺れていた。
 * さらにワークスペース名・プロジェクト名・チャット名が同じだと階層を誤読しやすかった。
 *
 * 階層は props の有無で決まる:
 * - `feature` / `current` 無し … WS / プロジェクト(現在地)
 * - `feature` のみ … WS / プロジェクト / 機能(現在地)
 * - `feature` + `current` … WS / プロジェクト / 機能 / 個別リソース(現在地)
 * - `current` のみ … WS / プロジェクト / 現在地(README のようにカードを持たないページ)
 */
export function ProjectBreadcrumbs({
  workspace,
  project,
  feature,
  current,
}: {
  workspace: Pick<Workspace, 'slug' | 'name'>;
  project: Pick<Project, 'id' | 'name'>;
  feature?: ProjectFeature;
  /** 末端(現在地)の表示名。機能ページ自体が現在地なら省略する。 */
  current?: string;
}) {
  const projectHref = `/w/${workspace.slug}/projects/${project.id}`;
  const isProjectCurrent = !feature && !current;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={`/w/${workspace.slug}`} className="max-w-[10rem] truncate">
              {workspace.name}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        <BreadcrumbSeparator />

        <BreadcrumbItem>
          {isProjectCurrent ? (
            <BreadcrumbPage className="max-w-[14rem] truncate">{project.name}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link href={projectHref} className="max-w-[14rem] truncate">
                {project.name}
              </Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>

        {feature && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {current ? (
                <BreadcrumbLink asChild>
                  <Link href={featureHref(workspace.slug, project.id, feature)}>
                    {PROJECT_FEATURE_META[feature].label}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{PROJECT_FEATURE_META[feature].label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </>
        )}

        {current && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="max-w-[16rem] truncate">{current}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
