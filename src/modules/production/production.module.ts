import { MaterialsReceivingModule } from '../materials-receiving/materials-receiving.module';
import { MaterialProductionReceiptService } from './material-production-receipt.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialWorkflow, MaterialWorkflowStep } from '../../entities/master/material-engineering.entity';
import { Material } from '../../entities/master/material.entity';
import { ProductWorkflow } from '../../entities/master/product-workflow.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import {
  ProductionOrder,
  ProductionOrderLine,
} from '../production-orders/production-order.entity';
import { ProcessController } from './production-process/process.controller';
import { TraceabilityController } from './traceability/traceability.controller';
import { TraceabilityService } from './traceability/traceability.service';
import { PackageController } from './production-package/package.controller';
import { PackageService } from './production-package/package.service';
import { BoardService } from './production-process/board.service';
import { CloseService } from './production-process/close.service';
import { HistoryService } from './production-process/history.service';
import { ProcessService } from './production-process/process.service';
import { ReconciliationService } from './production-process/reconciliation.service';
import { ReversalService } from './production-process/reversal.service';
import { TransferService } from './production-process/transfer.service';
import { LotService } from './production-lot/lot.service';
import { LedgerService } from './production-transaction/ledger.service';
import { WipService } from './production-wip/wip.service';
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
 * Production lot & QR traceability. Phase 2: WIP release + first-step
 * produce (ORIGIN lots); transfer, later-step produce, FG receive, packages
 * and traceability arrive in later phases — see
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
  imports: [
    AccessControlModule,
    MaterialsReceivingModule,
    TypeOrmModule.forFeature([
      ...PRODUCTION_TRACE_ENTITIES,
      ProductionOrder,
      ProductionOrderLine,
      ProductWorkflow,
      Material,
      MaterialWorkflow,
      MaterialWorkflowStep,
    ]),
  ],
  controllers: [ProcessController, PackageController, TraceabilityController],
  providers: [
    MaterialProductionReceiptService,
    LedgerService,
    WipService,
    LotService,
    ProcessService,
    TransferService,
    BoardService,
    ReversalService,
    ReconciliationService,
    CloseService,
    HistoryService,
    PackageService,
    TraceabilityService,
  ],
  exports: [TypeOrmModule, LedgerService, WipService, LotService, MaterialProductionReceiptService],
})
export class ProductionModule {}
