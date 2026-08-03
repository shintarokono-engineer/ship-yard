import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';

import { InlineEmpty } from '@/components/inline-empty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectBreadcrumbs } from '@/components/project-breadcrumbs';
import { isAdminRole, isWriterRole, PROJECT_STATUS_META } from '@/lib/api/types';
import { EMPTY_MESSAGES } from '@/lib/empty-messages';
import { featureHref, PROJECT_FEATURE_META, type ProjectFeature } from '@/lib/project-features';
import { fetchProject, fetchUsage, fetchWorkspace, listDocuments } from '@/lib/api/workspaces';
import { formatDate, formatDateTime } from '@/lib/format';

import { DeleteProjectButton } from './_components/delete-project-button';
import { EditProjectDialog } from './_components/edit-project-dialog';
import { GenerateReadmeDialog } from './readme/_components/generate-readme-dialog';

/** README プレビュー本文の先頭表示文字数(§9.12.4 で Project 詳細にインライン表示)。 */
const README_PREVIEW_CHARS = 200;

/**
 * `/w/{slug}/projects/{projectId}` — プロジェクト詳細ページ。
 *
 * 役割:
 * - プロジェクト情報の表示(名前・概要・状態・各種日付)
 * - 編集 / 削除アクション(ロール別に出し分け)
 * - **README プレビューセクション**(§9.12.4、A1 採用、`/readme/` 単独ページへの導線 + AI 生成 Dialog)
 * - 子リソースのエントリポイント(チェックリスト / 壁打ち / LP / 検証 or 診断)
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  // layout で workspace の所属チェック済み。fetchWorkspace は React.cache で dedup される。
  const [workspace, project, readmes, usage] = await Promise.all([
    fetchWorkspace(slug),
    fetchProject(slug, projectId),
    listDocuments(slug, projectId, 'README'),
    fetchUsage(slug),
  ]);
  if (!workspace) notFound();
  if (!project) notFound();

  const meta = PROJECT_STATUS_META[project.status];
  const canWrite = isWriterRole(workspace.role);
  const canDelete = isAdminRole(workspace.role);

  // README は append-only 履歴。最新 = version 降順の先頭。
  const sortedReadmes = readmes.toSorted((a, b) => b.version - a.version);
  const latestReadme = sortedReadmes[0] ?? null;
  const readmePreview =
    latestReadme?.content && latestReadme.content.length > 0
      ? latestReadme.content.length > README_PREVIEW_CHARS
        ? `${latestReadme.content.slice(0, README_PREVIEW_CHARS)}…`
        : latestReadme.content
      : null;

  return (
    <div className="space-y-8 cursor-default">
      <div className="space-y-4">
        <ProjectBreadcrumbs workspace={workspace} project={project} />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{project.name}</h1>
              <Badge variant={meta.badgeVariant} className={meta.badgeClassName}>
                {meta.label}
              </Badge>
            </div>
            <dl className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <div className="flex gap-1">
                <dt>作成</dt>
                <dd>{formatDateTime(project.createdAt)}</dd>
              </div>
              <div className="flex gap-1">
                <dt>更新</dt>
                <dd>{formatDateTime(project.updatedAt)}</dd>
              </div>
              {project.launchDate && (
                <div className="flex gap-1">
                  <dt>リリース予定</dt>
                  <dd>{formatDate(project.launchDate)}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="flex shrink-0 gap-2">
            {canWrite && <EditProjectDialog slug={slug} project={project} />}
            {canDelete && <DeleteProjectButton slug={slug} project={project} />}
          </div>
        </div>

        <section aria-labelledby="description-heading" className="space-y-2">
          <h2 id="description-heading" className="text-sm font-medium">
            概要
          </h2>
          {project.description ? (
            <p className="whitespace-pre-wrap text-sm">{project.description}</p>
          ) : (
            <InlineEmpty>
              {canWrite
                ? EMPTY_MESSAGES.projectDescription.canWrite
                : EMPTY_MESSAGES.projectDescription.readOnly}
            </InlineEmpty>
          )}
        </section>

        <section aria-labelledby="readme-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="readme-heading" className="flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4" aria-hidden="true" />
              README
              {latestReadme && (
                <span className="text-muted-foreground text-xs font-normal">
                  v{latestReadme.version} ({sortedReadmes.length} 件)
                </span>
              )}
            </h2>
            {canWrite && (
              <div className="flex shrink-0 gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/w/${slug}/projects/${projectId}/readme`}>
                    {latestReadme ? '編集 / 履歴' : '全文を見る'}
                  </Link>
                </Button>
                <GenerateReadmeDialog slug={slug} projectId={projectId} usage={usage} />
              </div>
            )}
          </div>
          {readmePreview ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{readmePreview}</p>
          ) : (
            <InlineEmpty>
              {canWrite ? EMPTY_MESSAGES.readme.canWrite : EMPTY_MESSAGES.readme.readOnly}
            </InlineEmpty>
          )}
          {latestReadme && (
            <p className="text-muted-foreground text-xs">
              更新 {formatDateTime(latestReadme.createdAt)}
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          slug={slug}
          projectId={projectId}
          feature="CHECKLIST"
          badge={`${project._count.checklist} 件`}
        />
        <FeatureCard slug={slug} projectId={projectId} feature="RAG_QA" />
        <FeatureCard slug={slug} projectId={projectId} feature="ANNOUNCEMENT" />
        <FeatureCard slug={slug} projectId={projectId} feature="LANDING_PAGE" />

        {/*
          ADR-013 改訂版「2 モード化」:
          - status=IDEA       → 「アイデア検証」 Card(IdeaValidation)
          - status=IN_DEV 以降 → 「プロダクト診断」 Card(ServiceScore)
          両 Card は同時には出さない(機能を分けて UX を明確にする ADR-013 改訂版の意図)。
        */}
        <FeatureCard
          slug={slug}
          projectId={projectId}
          feature={project.status === 'IDEA' ? 'IDEA_VALIDATION' : 'DIAGNOSIS'}
        />
      </div>
    </div>
  );
}

/**
 * 子リソースへのエントリポイント Card。
 *
 * ラベル・アイコン・説明・遷移先は `PROJECT_FEATURE_META` を唯一の出所とする
 * (機能ページ側の見出しも同じ定数を参照する)。
 *
 * `aria-label` 未指定だと accessible name が「見出し + 件数 + 説明文」の連結になる。
 * 値は可視の見出しと同一文字列にすること(WCAG 2.5.3 Label in Name)。
 */
function FeatureCard({
  slug,
  projectId,
  feature,
  badge,
}: {
  slug: string;
  projectId: string;
  feature: ProjectFeature;
  /** 件数などの補助表示(タイトル右端)。 */
  badge?: string;
}) {
  const meta = PROJECT_FEATURE_META[feature];
  const Icon = meta.icon;

  return (
    <Link
      href={featureHref(slug, projectId, feature)}
      aria-label={meta.label}
      className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
    >
      <Card className="hover:border-primary/40 cursor-pointer transition-all hover:shadow-sm [&_*]:cursor-pointer">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="text-primary size-4" aria-hidden="true" />
            {meta.label}
            {badge && (
              <span className="text-muted-foreground ml-auto text-xs font-normal">{badge}</span>
            )}
            {meta.planLimited && (
              <Badge variant="outline" className="ml-auto text-[10px] font-normal">
                Pro / Team
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{meta.description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
