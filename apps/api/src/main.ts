import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true → 未加工のリクエストボディを req.rawBody(Buffer)に残す(Stripe Webhook の署名検証に必須)
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // DTO クラス(class-validator デコレータ付き)を自動検証する。
  // - whitelist: DTO に無いプロパティは黙って除去
  // - forbidNonWhitelisted: 未知のプロパティが来たら 400(除去ではなく拒否)
  // - transform: プレーンオブジェクトを DTO クラスのインスタンスに変換(型変換も行う)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

void bootstrap();
