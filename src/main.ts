import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join, resolve as resolvePath } from 'node:path';
import { AppModule } from './app.module';
import { CustomValidationPipe } from './common/pipes/validation.pipe';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { getAppConfig } from './config/app.config';
import { getEnv } from './config/env.utils';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/v1');
  // Storage root for Material images. Defaults to `<cwd>/uploads/materials`
  // but operators can override it via `MATERIAL_IMAGE_ROOT` so uploaded
  // content lives outside the project tree (e.g. on a dedicated drive).
  const imageRoot = resolvePath(
    getEnv('MATERIAL_IMAGE_ROOT', join(process.cwd(), 'uploads', 'materials')),
  );
  // `<root>/.tmp` holds newly uploaded (staged) images before they are
  // promoted next to a saved Material. We mount it as a higher-priority
  // static directory so staged paths resolve before promoted ones.
  app.useStaticAssets(join(imageRoot, '.tmp'), {
    prefix: '/uploads/materials/.tmp/',
  });
  app.useStaticAssets(imageRoot, {
    prefix: '/uploads/materials/',
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

export { bootstrap };

if (require.main === module) {
  void bootstrap();
}
