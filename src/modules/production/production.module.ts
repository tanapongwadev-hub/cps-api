import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessWip, ProcessWipOrigin } from './entities/process-wip.entity';
import {
  ProductionLot,
  ProductionLotCounter,
  ProductionLotOrigin,
  ProductionLotSource,
} from './entities/production-lot.entity';
import {
  ProductionPackage,
  ProductionPackageSource,
} from './entities/production-package.entity';
import {
  ProductionTransaction,
  ProductionTransactionOrigin,
} from './entities/production-transaction.entity';

/**
 * Production lot & QR traceability. Phase 1 registers the data model only;
 * services/controllers (produce, transfer, FG receive, packages,
 * traceability) arrive in later phases — see
 * admin-dashboard/docs/plans/2026-10-05-production-lot-traceability-plan.md.
 */
export const PRODUCTION_TRACE_ENTITIES = [
  ProductionLot,
  ProductionLotSource,
  ProductionLotOrigin,
  ProductionLotCounter,
  ProcessWip,
  ProcessWipOrigin,
  ProductionTransaction,
  ProductionTransactionOrigin,
  ProductionPackage,
  ProductionPackageSource,
];

@Module({
  imports: [TypeOrmModule.forFeature(PRODUCTION_TRACE_ENTITIES)],
  exports: [TypeOrmModule],
})
export class ProductionModule {}
