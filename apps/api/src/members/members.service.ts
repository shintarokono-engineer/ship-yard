import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Role } from '@shipyard/db';

import { PrismaService } from '../prisma/prisma.service';

/** `MembersService.list` の戻り値要素。フロントの「メンバー一覧」表示に必要な User 情報込み。 */
export interface MemberListItem {
  userId: string;
  role: Role;
  joinedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

/** `MembersService.updateRole` の戻り値(更新後の状態)。 */
export interface UpdatedMember {
  userId: string;
  role: Role;
  joinedAt: Date;
}

/** 一覧で表示する際のロール優先順(OWNER → ADMIN → ... の順)。フロント側ソート不要にする。 */
const ROLE_DISPLAY_ORDER: Record<Role, number> = {
  OWNER: 0,
  ADMIN: 1,
  DEVELOPER: 2,
  REVIEWER: 3,
  TESTER: 4,
  VIEWER: 5,
};

/**
 * メンバー管理(`TenantMember` の参照 / ロール変更 / 削除)。
 *
 * **認可の実装場所**:
 * - `MembersController` の class-level guards(`ClerkAuthGuard` + `WorkspaceGuard`)で
 *   「認証済 + そのワークスペースに所属」 まで保証する
 * - **詳細な認可(自分自身か / 対象が OWNER か / actor の階層)は本 Service が判定**する。
 *   controller の `@Roles(...ADMIN_ROLES)` だけでは「自分のロール変更不可」「ADMIN→ADMIN 不可」等の
 *   条件分岐を表現できないため、認可ロジックを Service 層に集約する設計
 *
 * **OWNER の扱い**:
 * - OWNER は `Tenant.ownerId` に対応する唯一のメンバー。ロール変更・削除いずれも不可
 * - 所有権譲渡は将来別 API(`POST /workspaces/:slug/transfer-ownership`)で実装予定
 * - これにより `Tenant.ownerId` が必ず有効な `TenantMember(role=OWNER)` を指す不変条件を維持
 */
@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /workspaces/:slug/members(TenantMember 全員が閲覧可)。 */
  async list(tenantId: string): Promise<MemberListItem[]> {
    const rows = await this.prisma.tenantMember.findMany({
      where: { tenantId },
      select: {
        userId: true,
        role: true,
        joinedAt: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    // ロール順 → joinedAt 昇順(古参が上に)で並び替え。SQL の ORDER BY enum はサポート外なのでアプリ側で実施。
    return rows.sort((a, b) => {
      const diff = ROLE_DISPLAY_ORDER[a.role] - ROLE_DISPLAY_ORDER[b.role];
      if (diff !== 0) return diff;
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    });
  }

  /**
   * PATCH /workspaces/:slug/members/:userId(認可は本 method 内)。
   *
   * 認可ルール(いずれかに当てはまれば 403):
   * - actor.userId === targetUserId(自分のロール変更不可、フットガン防止)
   * - actor.role が OWNER でも ADMIN でもない(`@Roles(...ADMIN_ROLES)` の代わりにここで弾く)
   * - 対象が OWNER(所有権譲渡は別 API)
   * - actor.role === ADMIN かつ 対象.role === ADMIN(同階層保護:ADMIN は ADMIN を操作できない)
   */
  async updateRole(
    tenantId: string,
    actor: { userId: string; role: Role },
    targetUserId: string,
    newRole: Role,
  ): Promise<UpdatedMember> {
    if (actor.userId === targetUserId) {
      throw new ForbiddenException('Cannot change your own role.');
    }

    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'You do not have permission to perform this action in this workspace',
      );
    }

    const target = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException();

    if (target.role === Role.OWNER) {
      throw new ForbiddenException('Cannot change the OWNER role. Ownership transfer is a separate operation.');
    }

    if (actor.role === Role.ADMIN && target.role === Role.ADMIN) {
      throw new ForbiddenException('ADMIN cannot change another ADMIN role.');
    }

    const updated = await this.prisma.tenantMember.update({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
      data: { role: newRole },
      select: { userId: true, role: true, joinedAt: true },
    });
    return updated;
  }

  /**
   * DELETE /workspaces/:slug/members/:userId(認可は本 method 内、自己退会も同経路)。
   *
   * 認可ルール:
   * - 対象 = OWNER → 403(自己退会 / 他者削除いずれも不可)
   * - 対象 = 自分(自己退会):上記 OWNER 制約以外は許可(ロール不問)
   * - 対象 = 他人(他者削除):
   *   - actor.role が OWNER でも ADMIN でもない → 403
   *   - actor.role === ADMIN かつ 対象.role === ADMIN → 403(同階層保護)
   *   - それ以外 → 許可
   * - 対象が未存在(テナント内に該当 userId なし) → 404
   */
  async remove(
    tenantId: string,
    actor: { userId: string; role: Role },
    targetUserId: string,
  ): Promise<void> {
    const target = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException();

    if (target.role === Role.OWNER) {
      throw new ForbiddenException('Cannot remove the OWNER. Ownership transfer is required first.');
    }

    const isSelfWithdrawal = actor.userId === targetUserId;
    if (!isSelfWithdrawal) {
      // 他者削除は OWNER/ADMIN のみ
      if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
        throw new ForbiddenException(
          'You do not have permission to perform this action in this workspace',
        );
      }
      // ADMIN は ADMIN(他人)を削除できない
      if (actor.role === Role.ADMIN && target.role === Role.ADMIN) {
        throw new ForbiddenException('ADMIN cannot remove another ADMIN.');
      }
    }
    // 自己退会の場合は role 不問(OWNER 以外、上で弾き済)

    await this.prisma.tenantMember.delete({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
    });
  }
}
