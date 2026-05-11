import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient, tenantExtension } from '@shipyard/db';

/**
 * tenantId 自動注入の Client Extension(ADR-002)を適用した PrismaClient を生成する。
 */
function createExtendedPrismaClient() {
  return new PrismaClient().$extends(tenantExtension);
}

type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;

// $extends の戻り値は PrismaClient のサブクラスではないため、クラスとして extends できない。
// 「コンストラクタが拡張クライアントを返すクラス」を作るのが NestJS 公式パターン。
const ExtendedPrismaClientCtor = class {
  constructor() {
    return createExtendedPrismaClient();
  }
} as new () => ExtendedPrismaClient;

/**
 * NestJS DI で「tenantId 自動注入済みの PrismaClient」を提供するサービス。
 * lifecycle hook で接続/切断を管理する。
 *
 * 業務 Service 層は `this.prisma.project.findMany()` のように書くだけで、
 * TenantMiddleware が確立した tenantId に基づき WHERE tenantId = ? が自動付与される。
 */
@Injectable()
export class PrismaService
  extends ExtendedPrismaClientCtor
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
