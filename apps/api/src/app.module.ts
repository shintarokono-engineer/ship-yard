import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { StripeModule } from './stripe/stripe.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { WorkspacesController } from './workspaces/workspaces.controller';

@Module({
  imports: [
    // .env.local を読んで process.env に展開(CLERK_SECRET_KEY / DATABASE_URL / PORT / STRIPE_*)
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.local' }),
    PrismaModule,
    StripeModule,
  ],
  controllers: [AppController, WorkspacesController],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 全ルートに TenantMiddleware を適用(ヘッダーが無いリクエストは素通し)
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
