import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([Supplier, SupplierMaterial]),
  ],
  controllers: [SuppliersController],
  providers: [SuppliersService, PermissionGuard],
  exports: [SuppliersService],
})
export class SuppliersModule {}
