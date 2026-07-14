import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.use(cookieParser());

  app.enableCors({
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [],
    credentials: true,
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Leak API')
      .setDescription(
        "Leak API is a high-performance, strictly-typed backend engine designed to power the Leak App, a modern personal finance management system. Built with NestJS, PostgreSQL, and Prisma, it's engineered from the ground up for absolute data integrity, atomic financial transactions, and rapid analytical insights.",
      )
      .setVersion('1.0')
      .build();

    SwaggerModule.setup('swagger', app, () =>
      SwaggerModule.createDocument(app, config),
    );
  }

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
