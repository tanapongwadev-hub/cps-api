import { DynamicModule, Global, Module } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { resolve as resolvePath } from 'node:path';
import {
  getDataSourceToken,
  getRepositoryToken,
  TypeOrmModule,
} from '@nestjs/typeorm';
import { DeliveryType } from '../../entities/master/delivery-type.entity';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { MaterialModel } from '../../entities/master/material-model.entity';
import { Material } from '../../entities/master/material.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AccessControlModule } from '../access-control/access-control.module';
import { AppModule } from '../../app.module';
import {
  MATERIAL_IMAGE_ROOT,
  MaterialImageStorageService,
} from './material-image-storage.service';
import { MaterialsController } from './materials.controller';
import { MaterialsModule } from './materials.module';
import { MaterialsService } from './materials.service';

const dataSource = {
  entityMetadatas: [],
  options: { type: 'postgres' },
  getRepository: jest.fn(() => ({})),
};

@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: dataSource }],
  exports: [getDataSourceToken()],
})
class TestDataSourceModule {}

describe('MaterialsModule', () => {
  it('registers every aggregate repository and the access-control wiring', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      MaterialsModule,
    ) as Array<DynamicModule | typeof AccessControlModule>;
    const typeOrmFeature = imports.find(
      (item): item is DynamicModule =>
        typeof item === 'object' && item.module === TypeOrmModule,
    );
    const providers: readonly unknown[] = typeOrmFeature?.providers ?? [];
    const repositoryTokens: unknown[] = [];
    for (const provider of providers) {
      if (
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider
      ) {
        repositoryTokens.push(provider.provide);
      }
    }

    expect(imports).toContain(AccessControlModule);
    for (const entity of [
      Material,
      SupplierMaterial,
      Unit,
      DeliveryType,
      MaterialModel,
      LoadingPoint,
      Supplier,
    ]) {
      expect(repositoryTokens).toContain(getRepositoryToken(entity));
    }
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, MaterialsModule),
    ).toEqual([MaterialsController]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, MaterialsModule),
    ).toEqual(
      expect.arrayContaining([
        MaterialsService,
        MaterialImageStorageService,
        PermissionGuard,
      ]),
    );
  });

  it('compiles with a test-only DataSource that never connects to a database', async () => {
    // Make the test hermetic: the operator's local `.env` may set
    // `MATERIAL_IMAGE_ROOT` to a host-specific path, so we explicitly
    // clear it before assembling the module and restore it afterwards.
    const previousRoot = process.env.MATERIAL_IMAGE_ROOT;
    delete process.env.MATERIAL_IMAGE_ROOT;
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TestDataSourceModule,
          // Provide a minimal ConfigModule so the `MATERIAL_IMAGE_ROOT`
          // factory can inject ConfigService. We explicitly ignore the
          // operator's local `.env` so the test stays hermetic.
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
          MaterialsModule,
        ],
      }).compile();

      expect(moduleRef.get(MaterialsController)).toBeInstanceOf(
        MaterialsController,
      );
      expect(moduleRef.get(MaterialsService)).toBeInstanceOf(MaterialsService);
      // With `MATERIAL_IMAGE_ROOT` unset, the factory returns `undefined`
      // and the storage service falls back to its built-in default.
      expect(moduleRef.get(MATERIAL_IMAGE_ROOT)).toBeUndefined();
      await moduleRef.close();
    } finally {
      if (previousRoot !== undefined) {
        process.env.MATERIAL_IMAGE_ROOT = previousRoot;
      }
    }
  });

  it('honours MATERIAL_IMAGE_ROOT when set in the environment', async () => {
    const expected = 'D:/project-cps/New/image/materials';
    const previousRoot = process.env.MATERIAL_IMAGE_ROOT;
    process.env.MATERIAL_IMAGE_ROOT = expected;
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TestDataSourceModule,
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
          MaterialsModule,
        ],
      }).compile();

      const resolved = moduleRef.get<string>(MATERIAL_IMAGE_ROOT);
      // The factory resolves the configured value via `path.resolve` so
      // the service gets an absolute, platform-correct path regardless
      // of the env shape.
      expect(resolved).toBe(resolvePath(expected));
      await moduleRef.close();
    } finally {
      if (previousRoot === undefined) {
        delete process.env.MATERIAL_IMAGE_ROOT;
      } else {
        process.env.MATERIAL_IMAGE_ROOT = previousRoot;
      }
    }
  });

  it('is registered in AppModule', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule)).toContain(
      MaterialsModule,
    );
  });
});
