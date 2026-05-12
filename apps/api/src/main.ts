import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true → 未加工のリクエストボディを req.rawBody(Buffer)に残す(Stripe Webhook の署名検証に必須)
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

void bootstrap();
