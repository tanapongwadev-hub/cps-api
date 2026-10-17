import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { StockBalancesModule } from '../stock-balances/stock-balances.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MaterialsDashboardService } from './materials-dashboard.service';

@Module({
  imports: [AccessControlModule, StockBalancesModule],
  controllers: [DashboardController],
  providers: [DashboardService, MaterialsDashboardService],
})
export class DashboardModule {}
