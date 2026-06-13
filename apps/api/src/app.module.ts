import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AIUsageService } from './ai/ai-usage.service';
import { AnthropicModule } from './ai/anthropic.module';
import { ChecklistGenController } from './ai/checklist-gen.controller';
import { ChecklistGenService } from './ai/checklist-gen.service';
import { DraftGenController } from './ai/draft-gen.controller';
import { DraftGenService } from './ai/draft-gen.service';
import { EmbeddingService } from './ai/embedding.service';
import { OpenAIModule } from './ai/openai.module';
import { RagQaController } from './ai/rag-qa.controller';
import { RagQaService } from './ai/rag-qa.service';
import { RagSearchService } from './ai/rag-search.service';
import { RefineDocController } from './ai/refine-doc.controller';
import { RefineDocService } from './ai/refine-doc.service';
import { TaskSplitController } from './ai/task-split.controller';
import { TaskSplitService } from './ai/task-split.service';
import { UsageController } from './ai/usage.controller';
import { AnnouncementGenService } from './announcements/announcement-gen.service';
import { AnnouncementController } from './announcements/announcement.controller';
import { AnnouncementService } from './announcements/announcement.service';
import { AppController } from './app.controller';
import { BlogPostModule } from './blog-posts/blog-post.module';
import { clerkClientProvider } from './auth/clerk-client.provider';
import { BillingService } from './billing/billing.service';
import { ChecklistController } from './checklist/checklist.controller';
import { ChecklistService } from './checklist/checklist.service';
import { CryptoModule } from './common/crypto/crypto.module';
import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { IdeaValidationController } from './idea-validation/idea-validation.controller';
import { IdeaValidationService } from './idea-validation/idea-validation.service';
import { IntegrationsTwitterModule } from './integrations/twitter/integrations-twitter.module';
import { InvitationsController } from './invitations/invitations.controller';
import { InvitationsService } from './invitations/invitations.service';
import { PublicInvitationsController } from './invitations/public-invitations.controller';
import { LandingPageController } from './landing-page/landing-page.controller';
import { LandingPageService } from './landing-page/landing-page.service';
import { LpGenService } from './landing-page/lp-gen.service';
import { PublicLandingPageController } from './landing-page/public-landing-page.controller';
import { MailModule } from './mail/mail.module';
import { MembersController } from './members/members.controller';
import { MembersService } from './members/members.service';
import { PrismaModule } from './prisma/prisma.module';
import { ProductDiagnosisController } from './product-diagnosis/product-diagnosis.controller';
import { ProductDiagnosisService } from './product-diagnosis/product-diagnosis.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { StripeModule } from './stripe/stripe.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { ClerkWebhookService } from './webhooks/clerk-webhook.service';
import { StripeWebhookService } from './webhooks/stripe-webhook.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { MembershipService } from './workspaces/membership.service';
import { WorkspacesController } from './workspaces/workspaces.controller';
import { WorkspacesService } from './workspaces/workspaces.service';

@Module({
  imports: [
    // .env.local を読んで process.env に展開(CLERK_SECRET_KEY / DATABASE_URL / PORT / STRIPE_* / APP_BASE_URL / ANTHROPIC_API_KEY / OPENAI_API_KEY / RESEND_API_KEY / MAIL_FROM)
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.local' }),
    PrismaModule,
    StripeModule,
    AnthropicModule,
    OpenAIModule,
    MailModule,
    CryptoModule,
    IntegrationsTwitterModule,
    // BlogPostModule は自己完結のため Module 分離(controllers / providers / exports)。
    // 一方 AnnouncementService / AnnouncementGenService / AnnouncementController は AppModule に
    // 直登録(AIUsageService が AppModule の直 provider のため、別 Module で wrap すると DI スコープ
    // が分かれて二重インスタンスが発生する。既存 AI 系 Controller も同じ AppModule 直登録パターン)。
    BlogPostModule,
  ],
  controllers: [
    AppController,
    WorkspacesController,
    WebhooksController,
    ProjectsController,
    ChecklistController,
    ChecklistGenController,
    DocumentsController,
    DraftGenController,
    RagQaController,
    RefineDocController,
    TaskSplitController,
    UsageController,
    LandingPageController,
    PublicLandingPageController,
    ProductDiagnosisController,
    IdeaValidationController,
    InvitationsController,
    PublicInvitationsController,
    MembersController,
    AnnouncementController,
  ],
  providers: [
    clerkClientProvider,
    MembershipService,
    WorkspacesService,
    BillingService,
    StripeWebhookService,
    ClerkWebhookService,
    ProjectsService,
    ChecklistService,
    DocumentsService,
    AIUsageService,
    DraftGenService,
    ChecklistGenService,
    EmbeddingService,
    RagSearchService,
    RagQaService,
    RefineDocService,
    TaskSplitService,
    InvitationsService,
    MembersService,
    LandingPageService,
    LpGenService,
    ProductDiagnosisService,
    IdeaValidationService,
    AnnouncementGenService,
    AnnouncementService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 全ルートに TenantMiddleware を適用(ヘッダーが無いリクエストは素通し)
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
