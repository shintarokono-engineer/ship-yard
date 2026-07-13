import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { runWithTenant } from '@shipyard/db';
import type { NextFunction, Request, Response } from 'express';

import { PrismaService } from '../prisma/prisma.service';

/**
 * テナント解決ヘッダー(ADR-003)。
 *
 * 注: 現状 apps/web の API クライアント(`lib/api/client.ts`)はこのヘッダーを送っていない。
 * `/w/{slug}` 配下の実ルートは `WorkspaceGuard` が URL の `:slug` からテナントを解決し、Service が
 * 引数の tenantId を明示注入する経路が SSoT。本ミドルウェアの ALS 注入はヘッダーが来た場合の
 * 二次的な経路(将来 ALS 前提コードを増やす際の布石)であり、現状の主経路ではない。
 */
const TENANT_SLUG_HEADER = 'x-tenant-slug';

/**
 * `X-Tenant-Slug` ヘッダーから tenant を解決し、リクエスト処理を
 * `runWithTenant(tenantId, ...)` で包む(ADR-002 / ADR-003)。
 *
 * - ヘッダーが無いリクエスト(health チェック、将来の Stripe Webhook 等)はそのまま通す
 * - slug が存在しなければ 404(存在の有無を漏らさない、ADR-003)
 * - 「現在のユーザーがそのテナントの TenantMember か」のチェックは Day 5 Phase C
 *   (Clerk 認証 Guard 導入後)に追加する
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const slug = req.headers[TENANT_SLUG_HEADER];

    if (typeof slug !== 'string' || slug.length === 0) {
      // テナント未確定のリクエスト
      next();
      return;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException();
    }

    // 以降のミドルウェア・ルートハンドラを tenant コンテキスト内で実行する。
    // next() を runWithTenant で包むことで AsyncLocalStorage が下流に伝搬する。
    runWithTenant(tenant.id, () => next());
  }
}
