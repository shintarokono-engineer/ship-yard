import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * PrismaService をアプリ全体で利用可能にするグローバル Module。
 * 各 feature module で import 不要(@Global なので)。
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
