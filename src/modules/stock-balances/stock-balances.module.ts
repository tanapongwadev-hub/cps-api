import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AccessControlModule } from '../access-control/access-control.module';
import { Material } from '../../entities/master/material.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockBalancesController } from './stock-balances.controller';
import { StockBalancesService } from './stock-balances.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([StockBalance, Material])],
  controllers: [StockBalancesController],
  providers: [StockBalancesService, PermissionGuard],
  exports: [StockBalancesService, PermissionGuard],
})
export class StockBalancesModule {}
