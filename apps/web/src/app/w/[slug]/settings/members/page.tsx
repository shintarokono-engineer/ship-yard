import Link from 'next/link';
import { notFound } from 'next/navigation';

import { InlineEmpty } from '@/components/inline-empty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listInvitations } from '@/lib/api/invitations';
import { listMembers } from '@/lib/api/members';
import { EMPTY_MESSAGES } from '@/lib/empty-messages';
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
 * - 各メンバーの「自分」判定は `workspace.userId`(BE が解決したアクセス中ユーザーの内部 User ID)を
 *   `member.userId` と直接突合する。BE 側の認可(`actor.userId === target.userId`)と同じ ID 基準で
 *   一致する。旧実装の Clerk `currentUser()` + email 突合(外部 API 往復 + Webhook 遅延時の誤検出)を廃止。
 */
export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const workspace = await fetchWorkspace(slug);
  if (!workspace) {
    notFound();
  }

  const isAdmin = isAdminRole(workspace.role);
  // ADR-012: 招待機能(メンバー追加)は Team プラン限定。
  // Pro / Free では BE 側で 403 を返すため、UI も同じ条件でガードして無用な API 呼び出しを避ける。
  const isTeamPlan = workspace.plan === 'TEAM';

  // 招待一覧は ADMIN かつ Team プランのみ取得(非 ADMIN・非 Team は 403)。並列実行のため
  // Promise.all で投機的に走らせず、条件付きで取得することでエラー混入を防ぐ。
  const [members, invitations] = await Promise.all([
    listMembers(slug),
    isAdmin && isTeamPlan ? listInvitations(slug) : Promise.resolve<InvitationListItem[]>([]),
  ]);

  // BE が解決した内部 User ID。メンバー一覧の userId と同じ基準で「自分」を判定できる。
  const currentUserId = workspace.userId;

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
    // 横スクロールのラッパーは `Table` が内包するので、ここは枠線だけ持つ。
    <div className="rounded-md border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="px-4">
              メンバー
            </TableHead>
            <TableHead scope="col" className="px-4">
              ロール
            </TableHead>
            <TableHead scope="col" className="px-4">
              参加日
            </TableHead>
            <TableHead scope="col" className="px-4 text-right">
              操作
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
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
              <TableRow key={m.userId}>
                {/* `TableCell` の既定は whitespace-nowrap。名前 + メールの 2 段は折り返させる。 */}
                <TableCell className="px-4 py-3 whitespace-normal">
                  <div className="font-medium">
                    {memberName}
                    {isSelf && <span className="text-muted-foreground ml-2 text-xs">(あなた)</span>}
                  </div>
                  <div className="text-muted-foreground text-xs">{m.user.email}</div>
                </TableCell>
                <TableCell className="px-4 py-3">
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
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3">
                  {formatDateTime(m.joinedAt)}
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                  {showDelete && (
                    <DeleteMemberDialog slug={slug} member={m} isSelfWithdrawal={isSelf} />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
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
      <InlineEmpty className="rounded-md border px-4 py-6 text-center">
        {EMPTY_MESSAGES.invitations}
      </InlineEmpty>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="px-4">
              メールアドレス
            </TableHead>
            <TableHead scope="col" className="px-4">
              ロール
            </TableHead>
            <TableHead scope="col" className="px-4">
              状態
            </TableHead>
            <TableHead scope="col" className="px-4">
              有効期限
            </TableHead>
            <TableHead scope="col" className="px-4">
              招待者
            </TableHead>
            <TableHead scope="col" className="px-4 text-right">
              操作
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((inv) => {
            const meta = INVITATION_STATUS_META[inv.status];
            const inviter = inv.invitedBy.name?.trim() || inv.invitedBy.email;
            return (
              <TableRow key={inv.id}>
                <TableCell className="px-4 py-3">{inv.email}</TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant="outline" className="font-mono">
                    {ROLE_LABELS[inv.role]}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant={meta.variant} className={meta.className}>
                    {meta.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3">
                  {formatDateTime(inv.expiresAt)}
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3">{inviter}</TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <InvitationRowActions slug={slug} invitationId={inv.id} status={inv.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
