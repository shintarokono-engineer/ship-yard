import { notFound } from 'next/navigation';
import { Rocket } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { isWriterRole } from '@/lib/api/types';
import { fetchWorkspace, listProjects } from '@/lib/api/workspaces';

import { NewProjectDialog } from './_components/new-project-dialog';
import { ProjectCard } from './_components/project-card';

/**
 * ワークスペースのダッシュボード(プロジェクト一覧)。
 *
 * 所属チェックは layout.tsx で済んでいる前提だが、ここでも `workspace.role` を引いて
 * 書き込み権限(`WRITER_ROLES`)で UI 出し分けを行う。`fetchWorkspace` は
 * `React.cache` でラップ済みなので、layout と合わせて API 通信は 1 回に dedup される。
 */
export default async function WorkspaceProjectsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // layout で所属チェック済みなので通常 null は来ないが、race condition 等に備える。
  const workspace = await fetchWorkspace(slug);
  if (!workspace) {
    notFound();
  }

  const canWrite = isWriterRole(workspace.role);
  const projects = await listProjects(slug);
  const hasProjects = projects.length > 0;

  return (
    <div className="space-y-6 cursor-default">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">プロジェクト</h1>
          <p className="text-muted-foreground text-sm">
            アイデアから運用まで、リリース工程を 1 箇所で管理します。
          </p>
        </div>
        {/* 空状態のときは中央 CTA だけで十分なので、ヘッダー CTA は projects 件数 > 0 のときのみ */}
        {canWrite && hasProjects && <NewProjectDialog slug={slug} />}
      </div>

      {/* グリッドは列数固定にしない。件数が少ないとき右に大きな余白が残り、カードも痩せて
          メタ情報が折り返すため。min-width ベースで件数と画面幅から列数を決める。 */}
      {hasProjects ? (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))]">
          {projects.map((p) => (
            <ProjectCard key={p.id} slug={slug} project={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Rocket}
          title="最初のプロジェクトを作成しましょう"
          description="アイデアを 1 行で書き留めるところから始められます。あとから AI に README やチェックリストを生成させられます。"
          action={canWrite ? <NewProjectDialog slug={slug} /> : undefined}
        />
      )}
    </div>
  );
}
