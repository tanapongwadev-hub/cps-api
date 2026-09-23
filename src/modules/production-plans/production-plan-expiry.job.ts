import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProductionPlansService } from './production-plans.service';

@Injectable()
export class ProductionPlanExpiryJob {
  private readonly logger = new Logger(ProductionPlanExpiryJob.name);

  constructor(
    private readonly productionPlansService: ProductionPlansService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'production-plan-auto-expiry',
  })
  async expireApprovedPlans(): Promise<void> {
    const expired = await this.productionPlansService.expireApprovedPlans();
    if (expired > 0) {
      this.logger.log(`Expired ${expired} Production Plan(s)`);
    }
  }
}
