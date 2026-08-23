import { Module } from '@nestjs/common';

import { JobsController } from './jobs.controller';
import { TrialReminderService } from './trial-reminder.service';

/**
 * 内部ジョブ Module(F20 トライアル終了通知)。
 *
 * 依存する PrismaService / StripeService / MailService はいずれも `@Global()` Module から
 * 提供されるため、AppModule 直登録の provider には依存しない。したがって BlogPostModule と
 * 同じく独立 Module にしても DI スコープの二重化は起きない(AppModule のコメント参照)。
 */
@Module({
  controllers: [JobsController],
  providers: [TrialReminderService],
})
export class JobsModule {}
