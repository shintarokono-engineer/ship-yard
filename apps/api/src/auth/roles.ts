import { SetMetadata } from '@nestjs/common';

import { Role } from '@shipyard/db';

/**
 * テナント内のロール(`@shipyard/db` の `Role` enum)による操作権限の宣言。
 * schema の `Role` 定義(docs/data-model.md)に対応する。実際の検証は `WorkspaceGuard` が行う。
 */

/** Project / ChecklistItem / ProjectDocument を「作成・編集」できるロール(schema: DEVELOPER 以上)。 */
export const WRITER_ROLES: readonly Role[] = [Role.OWNER, Role.ADMIN, Role.DEVELOPER];

/** メンバー管理・ロール変更・リソース削除など「管理操作」ができるロール(schema: ADMIN 以上)。 */
export const ADMIN_ROLES: readonly Role[] = [Role.OWNER, Role.ADMIN];

/** `@Roles()` がハンドラ/コントローラに書き込むメタデータのキー。`WorkspaceGuard` が読む。 */
export const ROLES_KEY = 'shipyard:roles';

/**
 * このハンドラ(またはコントローラ)に必要なロールを宣言する。`WorkspaceGuard` が読み取り、
 * 現在のユーザーのロールが含まれなければ 403 を返す。未指定 = テナントメンバーなら誰でも可。
 *
 * 使い方: `@Roles(...WRITER_ROLES)` のように定義済みグループを展開して渡せる。
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
