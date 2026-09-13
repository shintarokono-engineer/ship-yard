import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleAlert, FileQuestion, TriangleAlert } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { ApiError } from '@/lib/api/errors';
import { claimPublicCheck } from '@/lib/api/public-check';

import { ClaimRedirect } from './_components/claim-redirect';

/** 中間ページなので検索対象にしない。 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

const FAILURE = {
  conflict: {
    icon: CircleAlert,
    title: 'この結果は引き換え済みです',
    description:
      '別のアカウントで既に引き換えられています。お使いのワークスペースから新しくアイデア検証を実行できます。',
  },
  notFound: {
    icon: FileQuestion,
    title: '診断結果が見つかりません',
    description: '保持期間を過ぎて削除されたか、URL が正しくない可能性があります。',
  },
  unknown: {
    icon: TriangleAlert,
    title: '引き換えに失敗しました',
    description: '時間をおいて再度お試しください。',
  },
} as const;

/**
 * `/check/{id}/claim` — 診断結果を登録済みアカウントへ持ち越す中間ページ(ADR-015)。
 *
 * **認証必須**(middleware の公開ルートに含めない)。ワークスペース / Project(IDEA)/
 * 5 軸フル診断をまとめて作る。
 */
export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await claimPublicCheck(id);
    // 診断を起動できなかった場合(クレジット不足)もプロジェクト詳細へ送り、失敗で着地させない。
    const destination = result.projectId
      ? result.jobId
        ? `/w/${result.workspaceSlug}/projects/${result.projectId}/idea-validations`
        : `/w/${result.workspaceSlug}/projects/${result.projectId}`
      : `/w/${result.workspaceSlug}`;
    return <ClaimRedirect to={destination} />;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : null;
    const failure =
      status === 409 ? FAILURE.conflict : status === 404 ? FAILURE.notFound : FAILURE.unknown;

    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16">
        <EmptyState
          icon={failure.icon}
          title={failure.title}
          description={failure.description}
          action={
            <ButtonGroup>
              <Button asChild>
                <Link href="/">ワークスペースへ</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/check">別のアイデアを診断する</Link>
              </Button>
            </ButtonGroup>
          }
        />
      </main>
    );
  }
}
