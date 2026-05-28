import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, type ClerkClient } from '@clerk/backend';

/**
 * Clerk Backend SDK のクライアント注入トークン(§9.10 Clerk webhook、Day 49)。
 *
 * 主用途は JIT プロビジョニング(Webhook が未到達でも `clerkClient.users.getUser()` で
 * email/name/image を取得し `User` を作る)。`ClerkAuthGuard` は JWT のみ検証する責務に
 * 限定しているため、ユーザー詳細が必要な場面はこの provider を使う。
 */
export const CLERK_CLIENT = Symbol('CLERK_CLIENT');

export type { ClerkClient };

export const clerkClientProvider: Provider = {
  provide: CLERK_CLIENT,
  useFactory: (config: ConfigService): ClerkClient =>
    createClerkClient({ secretKey: config.getOrThrow<string>('CLERK_SECRET_KEY') }),
  inject: [ConfigService],
};
