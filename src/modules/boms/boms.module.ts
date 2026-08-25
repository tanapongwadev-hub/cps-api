import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductBom, ProductBomItem } from '../../entities/master/product-bom.entity';
import { Material } from '../../entities/master/material.entity';
import { Unit } from '../../entities/master/unit.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([ProductBom, ProductBomItem, Material, Unit]),
  ],
  controllers: [BomsController],
  providers: [BomsService],
  exports: [BomsService],
})
export class BomsModule {}
