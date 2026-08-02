import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { CustomValidationPipe } from './common/pipes/validation.pipe';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { getAppConfig } from './config/app.config';
import { getEnv } from './config/env.utils';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/v1');
  const uploadsDirectory = join(process.cwd(), 'uploads');
  app.useStaticAssets(join(uploadsDirectory, 'materials', '.tmp'), {
    prefix: '/uploads/materials/.tmp/',
  });
  app.useStaticAssets(uploadsDirectory, {
    prefix: '/uploads/',
  });

  // Global validation pipe
  app.useGlobalPipes(new CustomValidationPipe());

  // Global logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // CORS
  const corsOrigin = getEnv('CORS_ORIGIN', '');
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',') : true,
    credentials: true,
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('CPS Access Control API')
    .setDescription(
      'Access Control System API with Role-Based Access Control (RBAC)',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('departments', 'Department management')
    .addTag('roles', 'Role management')
    .addTag('menus', 'Menu management')
    .addTag('permissions', 'Permission management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const { port } = getAppConfig();
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
}

void bootstrap();
