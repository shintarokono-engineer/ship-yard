import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { BillingService } from './billing/billing.service';
import { PrismaModule } from './prisma/prisma.module';
import { StripeModule } from './stripe/stripe.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { StripeWebhookService } from './webhooks/stripe-webhook.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { WorkspacesController } from './workspaces/workspaces.controller';

@Module({
  imports: [
    // .env.local を読んで process.env に展開(CLERK_SECRET_KEY / DATABASE_URL / PORT / STRIPE_* / APP_BASE_URL)
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.local' }),
    PrismaModule,
    StripeModule,
  ],
  controllers: [AppController, WorkspacesController, WebhooksController],
  providers: [BillingService, StripeWebhookService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 全ルートに TenantMiddleware を適用(ヘッダーが無いリクエストは素通し)
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
