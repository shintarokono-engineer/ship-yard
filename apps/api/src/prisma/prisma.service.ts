import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@shipyard/db';

/**
 * NestJS DI で PrismaClient を提供するサービス。
 * lifecycle hook で接続/切断を管理する。
 *
 * Day 5 Phase B(Task 14)で tenantId 自動注入の Client Extension を適用予定。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
