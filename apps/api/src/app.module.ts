import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AIUsageService } from './ai/ai-usage.service';
import { AnthropicModule } from './ai/anthropic.module';
import { DraftGenController } from './ai/draft-gen.controller';
import { DraftGenService } from './ai/draft-gen.service';
import { AppController } from './app.controller';
import { BillingService } from './billing/billing.service';
import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { StripeModule } from './stripe/stripe.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { StripeWebhookService } from './webhooks/stripe-webhook.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { MembershipService } from './workspaces/membership.service';
import { WorkspacesController } from './workspaces/workspaces.controller';

@Module({
  imports: [
    // .env.local を読んで process.env に展開(CLERK_SECRET_KEY / DATABASE_URL / PORT / STRIPE_* / APP_BASE_URL / ANTHROPIC_API_KEY)
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.local' }),
    PrismaModule,
    StripeModule,
    AnthropicModule,
  ],
  controllers: [
    AppController,
    WorkspacesController,
    WebhooksController,
    ProjectsController,
    DocumentsController,
    DraftGenController,
  ],
  providers: [
    MembershipService,
    BillingService,
    StripeWebhookService,
    ProjectsService,
    DocumentsService,
    AIUsageService,
    DraftGenService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 全ルートに TenantMiddleware を適用(ヘッダーが無いリクエストは素通し)
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
