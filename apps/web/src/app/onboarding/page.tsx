import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listMyWorkspaces } from '@/lib/api/workspaces';

import { CreateWorkspaceForm } from './_components/create-workspace-form';

/**
 * `/onboarding` — サインアップ直後の初回テナント作成フロー(Day 18)。
 *
 * Clerk の afterSignUpUrl からの遷移を想定。既存所属がある場合は「既存ワークスペース」も
 * 並列表示し、別のワークスペースを作成する経路としても機能する(2 つ目以降の作成)。
 *
 * BE: `GET /workspaces`(自分の所属一覧)+ `POST /workspaces`(新規作成)。
 */
export default async function OnboardingPage() {
  const workspaces = await listMyWorkspaces();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold">Shipyard へようこそ</h1>
        <p className="text-muted-foreground">
          まずは最初のワークスペースを作成しましょう。チームで使う場合は後からメンバーを招待できます。
        </p>
      </header>

      {workspaces.length > 0 && (
        <section aria-labelledby="existing-workspaces-heading" className="space-y-3">
          <h2 id="existing-workspaces-heading" className="text-sm font-medium">
            あなたのワークスペース
          </h2>
          <div className="space-y-2">
            {workspaces.map((ws) => (
              <Link
                key={ws.id}
                href={`/w/${ws.slug}`}
                className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
              >
                <Card className="hover:bg-accent/30 cursor-pointer transition-colors [&_*]:cursor-pointer">
                  <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{ws.name}</CardTitle>
                      <p className="text-muted-foreground text-xs">
                        shipyard.app/w/{ws.slug}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {ws.role}
                      </Badge>
                      <ArrowRight className="text-muted-foreground size-4" aria-hidden="true" />
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {workspaces.length > 0 ? '新しいワークスペースを作成' : 'ワークスペースを作成'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CreateWorkspaceForm />
        </CardContent>
      </Card>
    </main>
  );
}
