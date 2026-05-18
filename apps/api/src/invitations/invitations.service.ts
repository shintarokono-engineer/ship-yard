import { randomBytes } from 'crypto';

import {
  ConflictException,
  ForbiddenException,
  GoneException,
  InternalServerErrorException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { Role } from '@shipyard/db';

import { dayjs } from '../common/time';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateInvitationDto } from './dto/create-invitation.dto';

/** 招待トークン用ランダムバイト数(base64url で 43 文字、推測困難で URL safe)。 */
const INVITATION_TOKEN_BYTES = 32;

/** 招待リンクの有効期限(発行から N 日、`InvitationToken.expiresAt` に反映)。 */
const INVITATION_VALIDITY_DAYS = 7;

/** ロールの日本語ラベル(招待メール本文用、`MailService.sendInvitation` に渡す)。 */
const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'オーナー',
  ADMIN: '管理者',
  DEVELOPER: '開発者',
  REVIEWER: 'レビュワー',
  TESTER: 'テスター',
  VIEWER: '閲覧者',
};

/** `InvitationsService.create` の戻り値(レスポンスにそのまま流せる)。 */
export interface CreateInvitationResult {
  invitation: {
    id: string;
    email: string;
    role: Role;
    expiresAt: Date;
  };
  /** メール送信成功フラグ(false なら呼び出し側 UI で「メール送信失敗、再送が必要」と表示)。 */
  mailSent: boolean;
  /** メール送信失敗時の理由(運用切り分け用、ユーザーには露出しない方が良いが MVP では含める)。 */
  mailError?: string;
}

/** `InvitationsService.accept` の戻り値(承諾後、フロントが /w/{slug} に遷移するため slug を返す)。 */
export interface AcceptInvitationResult {
  tenantId: string;
  workspaceSlug: string;
  workspaceName: string;
  role: Role;
}

/**
 * メンバー招待(ADR-007)の作成と承諾。
 *
 * **作成(create)**:
 * 1. 招待トークンを暗号学的乱数で生成
 * 2. `InvitationToken` を INSERT(単一クエリ、トランザクションなし。理由は (3) で外部 I/O を呼ぶため)
 * 3. メール送信は `try/catch` で **ベストエフォート**(ADR-007、PostgreSQL アンチパターン回避):
 *    - トランザクション内で外部 I/O(Resend HTTP API)を待つとコネクションプールを長時間占有 → 他 API ブロック
 *    - 招待トークン作成 自体は成功させ、メール失敗時は `mailSent: false` をレスポンスに含める
 *    - 招待者は管理画面の再送 UI(Day 25)で再送できる
 *
 * **承諾(accept)**:
 * 1. token で `InvitationToken` を取得(404 if 未存在)
 * 2. 期限切れ → 410 Gone / 受諾済み → 409 Conflict / email 不一致 → 403 Forbidden
 * 3. トランザクションで `TenantMember` を upsert(既に他ロールで所属なら上書き)+ `acceptedAt` を更新
 *    - upsert 内は DB クエリのみで外部 I/O なし、安全にトランザクション化可能
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async create(
    tenantId: string,
    workspaceName: string,
    inviterUserId: string,
    dto: CreateInvitationDto,
  ): Promise<CreateInvitationResult> {
    // 招待者の表示名 / email を取得(メール本文の「○○ さんから招待されました」用)
    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterUserId },
      select: { name: true, email: true },
    });
    if (!inviter) {
      // MembershipService 経由で WorkspaceAccess.userId が解決済みなので通常は到達不能
      throw new InternalServerErrorException('Inviter User row not found');
    }

    // 暗号学的乱数で URL safe なトークンを生成(base64url、43 文字)
    const token = randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
    const expiresAt = dayjs.utc().add(INVITATION_VALIDITY_DAYS, 'day').toDate();

    const invitation = await this.prisma.invitationToken.create({
      data: {
        tenantId,
        email: dto.email,
        role: dto.role,
        token,
        expiresAt,
        invitedById: inviterUserId,
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    const inviterName = inviter.name?.trim() || inviter.email;

    // メール送信はベストエフォート。失敗してもトークン作成は維持(再送 UI で拾う、ADR-007)。
    try {
      await this.mail.sendInvitation({
        to: dto.email,
        token,
        workspaceName,
        inviterName,
        roleLabel: `${ROLE_LABELS[dto.role]}(${dto.role})`,
        expiresAt,
      });
      return { invitation, mailSent: true };
    } catch (e) {
      const mailError = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to send invitation email to ${dto.email}: ${mailError}`);
      return { invitation, mailSent: false, mailError };
    }
  }

  async accept(token: string, clerkUserId: string): Promise<AcceptInvitationResult> {
    const user = await this.prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true, email: true },
    });
    if (!user) {
      // Clerk JWT は通っているが User テーブルに同期されていないケース(Clerk Webhook 未受信等)
      throw new ForbiddenException('User not registered in Shipyard');
    }

    const invitation = await this.prisma.invitationToken.findUnique({
      where: { token },
      select: {
        id: true,
        tenantId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        tenant: { select: { slug: true, name: true } },
      },
    });
    if (!invitation) throw new NotFoundException();

    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Invitation has expired. Ask the inviter to resend.');
    }

    if (invitation.acceptedAt) {
      throw new ConflictException('Invitation has already been accepted.');
    }

    // 招待先 email と承諾ユーザーの email が一致するかを検証(ケース insensitive)
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('This invitation is for a different email address.');
    }

    // トランザクション: メンバー追加 + 招待トークンを「受諾済み」に
    // 両方 DB クエリのみ(外部 I/O なし)なので、トランザクション内で安全。
    await this.prisma.$transaction([
      this.prisma.tenantMember.upsert({
        where: { tenantId_userId: { tenantId: invitation.tenantId, userId: user.id } },
        // 既存メンバーがいない場合は招待ロールで作成
        create: { tenantId: invitation.tenantId, userId: user.id, role: invitation.role },
        // 既存メンバーがいる場合は招待ロールで上書き(MVP では単純化、降格防止は将来検討)
        update: { role: invitation.role },
      }),
      this.prisma.invitationToken.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    return {
      tenantId: invitation.tenantId,
      workspaceSlug: invitation.tenant.slug,
      workspaceName: invitation.tenant.name,
      role: invitation.role,
    };
  }
}
