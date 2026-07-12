import { currentUser } from '@clerk/nextjs/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listInvitations } from '@/lib/api/invitations';
import { listMembers } from '@/lib/api/members';
import { formatDateTime } from '@/lib/format';
import {
  type BadgeVariant,
  type InvitationListItem,
  type InvitationStatus,
  type Member,
  type Role,
  ROLE_LABELS,
  isAdminRole,
} from '@/lib/api/types';
import { fetchWorkspace } from '@/lib/api/workspaces';

import { DeleteMemberDialog } from './_components/delete-member-dialog';
import { InvitationRowActions } from './_components/invitation-row-actions';
import { InviteMemberDialog } from './_components/invite-member-dialog';
import { RoleSelect } from './_components/role-select';

const INVITATION_STATUS_META: Record<
  InvitationStatus,
  { label: string; variant: BadgeVariant; className?: string }
> = {
  PENDING: {
    label: '未承諾',
    variant: 'outline',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  ACCEPTED: {
    label: '承諾済み',
    variant: 'outline',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  EXPIRED: { label: '期限切れ', variant: 'secondary' },
  REVOKED: { label: '取り消し', variant: 'secondary' },
};

/**
 * 設定 → メンバータブ。
 *
 * - メンバー一覧は全 TenantMember 表示(BE が誰でも閲覧可)
 * - 招待発行 / 一覧 / 取消 / 再送は ADMIN_ROLES のみ表示(非 ADMIN が招待 API を叩くと 403)
 * - 各メンバーの「自分」判定は Clerk currentUser の primary email を `member.user.email` と
 *   ケース insensitive 比較。BE 側にも同じ判定(`actor.userId === target.userId`)があり
 *   矛盾しない。BE が真実の源、UI はあくまで誤操作防止のための表示分岐
 */
export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // currentUser() は workspace に依存しない(Clerk セッション由来)ので fetchWorkspace と並列化する。
  const [workspace, me] = await Promise.all([fetchWorkspace(slug), currentUser()]);
  if (!workspace) {
    notFound();
  }

  const isAdmin = isAdminRole(workspace.role);
  // ADR-012: 招待機能(メンバー追加)は Team プラン限定。
  // Pro / Free では BE 側で 403 を返すため、UI も同じ条件でガードして無用な API 呼び出しを避ける。
  const isTeamPlan = workspace.plan === 'TEAM';
  const myEmail = me?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;

  // 招待一覧は ADMIN かつ Team プランのみ取得(非 ADMIN・非 Team は 403)。並列実行のため
  // Promise.all で投機的に走らせず、条件付きで取得することでエラー混入を防ぐ。
  const [members, invitations] = await Promise.all([
    listMembers(slug),
    isAdmin && isTeamPlan ? listInvitations(slug) : Promise.resolve<InvitationListItem[]>([]),
  ]);

  const currentMember = myEmail
    ? members.find((m) => m.user.email.toLowerCase() === myEmail)
    : undefined;
  const currentUserId = currentMember?.userId;

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="text-lg font-semibold">メンバー</h2>
            <p className="text-muted-foreground text-sm">
              現在このワークスペースに所属するメンバーです。
            </p>
          </div>
          {isAdmin &&
            (isTeamPlan ? (
              <InviteMemberDialog slug={slug} />
            ) : (
              <div className="flex flex-col items-end gap-2">
                <p className="text-muted-foreground text-xs">
                  メンバー招待は Team プラン限定の機能です。
                </p>
                <Link href={`/w/${slug}/settings/billing`}>
                  <Button variant="outline" size="sm">
                    Team へアップグレード
                  </Button>
                </Link>
              </div>
            ))}
        </div>
        <MemberTable
          members={members}
          slug={slug}
          isAdmin={isAdmin}
          actorRole={workspace.role}
          currentUserId={currentUserId}
        />
      </section>

      {isAdmin && isTeamPlan && (
        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold">招待</h2>
            <p className="text-muted-foreground text-sm">
              発行済みの招待リンクです。未承諾は取消・再送、期限切れは再送ができます。
            </p>
          </div>
          <InvitationTable invitations={invitations} slug={slug} />
        </section>
      )}
    </div>
  );
}

function MemberTable({
  members,
  slug,
  isAdmin,
  actorRole,
  currentUserId,
}: {
  members: Member[];
  slug: string;
  isAdmin: boolean;
  actorRole: Role;
  currentUserId: string | undefined;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2 text-left font-medium">
              メンバー
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium">
              ロール
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium">
              参加日
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            // OWNER のロール・削除は誰も操作できない(所有権譲渡は別 API)。
            // 自分自身のロール変更も BE で 403。自己退会は許可。
            const isOwner = m.role === 'OWNER';
            // BE は ADMIN→ADMIN のロール変更・削除を 403 で弾く(MembersService)。
            // 「押せるが必ず失敗する」操作 UI を出さないよう actor=ADMIN かつ対象=ADMIN は隠す。
            const isAdminVsAdmin = actorRole === 'ADMIN' && m.role === 'ADMIN';
            const showRoleSelect = isAdmin && !isOwner && !isSelf && !isAdminVsAdmin;
            const showDelete = !isOwner && ((isAdmin && !isAdminVsAdmin) || isSelf);
            const memberName = m.user.name?.trim() || m.user.email;
            return (
              <tr key={m.userId} className="border-t">
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {memberName}
                    {isSelf && <span className="text-muted-foreground ml-2 text-xs">(あなた)</span>}
                  </div>
                  <div className="text-muted-foreground text-xs">{m.user.email}</div>
                </td>
                <td className="px-4 py-3">
                  {showRoleSelect ? (
                    <RoleSelect
                      slug={slug}
                      targetUserId={m.userId}
                      currentRole={m.role}
                      memberName={memberName}
                    />
                  ) : (
                    <Badge variant="outline" className="font-mono">
                      {ROLE_LABELS[m.role]}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDateTime(m.joinedAt)}</td>
                <td className="px-4 py-3 text-right">
                  {showDelete && (
                    <DeleteMemberDialog slug={slug} member={m} isSelfWithdrawal={isSelf} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvitationTable({
  invitations,
  slug,
}: {
  invitations: InvitationListItem[];
  slug: string;
}) {
  if (invitations.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border px-4 py-6 text-center text-sm">
        まだ招待は発行されていません。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2 text-left font-medium">
              メールアドレス
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium">
              ロール
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium">
              状態
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium">
              有効期限
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium">
              招待者
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => {
            const meta = INVITATION_STATUS_META[inv.status];
            const inviter = inv.invitedBy.name?.trim() || inv.invitedBy.email;
            return (
              <tr key={inv.id} className="border-t">
                <td className="px-4 py-3">{inv.email}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="font-mono">
                    {ROLE_LABELS[inv.role]}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={meta.variant} className={meta.className}>
                    {meta.label}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDateTime(inv.expiresAt)}</td>
                <td className="px-4 py-3 text-muted-foreground">{inviter}</td>
                <td className="px-4 py-3 text-right">
                  <InvitationRowActions slug={slug} invitationId={inv.id} status={inv.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
