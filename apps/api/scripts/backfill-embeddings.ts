/**
 * 既存 ProjectDocument のうち embedding が NULL の行を OpenAI text-embedding-3-small で埋め直す CLI スクリプト。
 *
 * 用途:
 *   通常経路(DocumentsService の自動 hook)の「失敗握りつぶし」で取りこぼした行を後追いで回収する保険。
 *   機能追加前の既存データ / 外部 API 障害時の取りこぼし / モデル変更後の再生成、いずれもこの 1 コマンドで対処する。
 *   `embedding IS NULL` の行のみを対象とするので冪等(何度叩いても安全、既に埋まっている行はスキップ)。
 *
 * 使い方:
 *   pnpm --filter @shipyard/api backfill:embeddings <tenantSlug> <fallbackUserId>
 *
 * 例:
 *   pnpm --filter @shipyard/api backfill:embeddings my-workspace usr_real001
 *
 * 引数:
 *   tenantSlug      対象テナントの slug(`Tenant.slug`)
 *   fallbackUserId  ProjectDocument.createdById が NULL の場合のフォールバック User.id(AIUsage 記録用)
 *
 * 失敗仕様:
 *   - OpenAI API 失敗は EmbeddingService 内で握りつぶしてログ出力(スクリプト全体は継続)
 *   - 終了時に「処理 N 件 / 成功 M 件」を出して exit
 *
 * 注意:
 *   - 環境変数 `OPENAI_API_KEY` が `apps/api/.env.local` に設定されていること
 *   - 1 件あたり ~500ms + OpenAI コスト ~0.001 円 / 件
 */
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AIUsageService } from '../src/ai/ai-usage.service';
import { EmbeddingService } from '../src/ai/embedding.service';
import { OpenAIModule } from '../src/ai/openai.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.local' }),
    PrismaModule,
    OpenAIModule,
  ],
  providers: [EmbeddingService, AIUsageService],
})
class BackfillModule {}

async function main(): Promise<void> {
  const [tenantSlug, fallbackUserId] = process.argv.slice(2);
  if (!tenantSlug || !fallbackUserId) {
    console.error(
      'Usage: pnpm --filter @shipyard/api backfill:embeddings <tenantSlug> <fallbackUserId>',
    );
    process.exit(1);
  }

  const logger = new Logger('backfill:embeddings');
  const app = await NestFactory.createApplicationContext(BackfillModule, { logger });

  const prisma = app.get(PrismaService);
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true },
  });
  if (!tenant) {
    logger.error(`Tenant not found: slug=${tenantSlug}`);
    await app.close();
    process.exit(1);
  }

  logger.log(`Backfilling embeddings for tenant "${tenant.name}" (id=${tenant.id})...`);
  const embeddings = app.get(EmbeddingService);
  const { processed, succeeded } = await embeddings.backfillForTenant(tenant.id, fallbackUserId);
  logger.log(`Done: processed=${processed}, succeeded=${succeeded}`);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
