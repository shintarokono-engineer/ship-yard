import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { isWriterRole } from '@/lib/api/types';
import { fetchLandingPage, fetchProject, fetchWorkspace } from '@/lib/api/workspaces';

import { LpEditor } from './_components/lp-editor';

/**
 * `/w/{slug}/projects/{projectId}/landing-page/edit` — LP ブロックのテキスト編集(ADR-009、Day 32)。
 *
 * 既存 LP の各ブロックのテキストフィールドを編集する。編集は WRITER_ROLES のみ(閲覧専用ロールは
 * プレビューへ戻す)。LP 未生成のプロジェクトも編集対象が無いためプレビュー(空状態)へ戻す。
 */
export default async function LandingPageEditPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  const workspace = await fetchWorkspace(slug);
  if (!workspace) notFound();

  const project = await fetchProject(slug, projectId);
  if (!project) notFound();

  const previewHref = `/w/${slug}/projects/${projectId}/landing-page`;

  // 編集は WRITER 以上。閲覧専用ロールはプレビューへ戻す(API 側でも 403 ガード)。
  if (!isWriterRole(workspace.role)) redirect(previewHref);

  const landingPage = await fetchLandingPage(slug, projectId);
  // LP 未生成は編集対象が無いため、プレビュー(空状態 + 生成導線)へ戻す。
  if (!landingPage || landingPage.blocks.length === 0) redirect(previewHref);

  return (
    <div className="space-y-6 cursor-default">
      <div className="space-y-2">
        <Link
          href={previewHref}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          プレビューへ戻る
        </Link>
        <h1 className="text-2xl font-semibold">ランディングページを編集</h1>
        <p className="text-muted-foreground text-sm">
          各ブロックのテキストを編集できます。ブロックの追加・削除・並び替えは今後対応予定です。
        </p>
      </div>

      <LpEditor slug={slug} projectId={projectId} initialBlocks={landingPage.blocks} />
    </div>
  );
}
