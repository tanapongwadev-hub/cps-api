import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { DocumentCounter } from '../../entities/inventory/document-counter.entity';
import { GoodsReceiptAttachment } from '../../entities/inventory/goods-receipt-attachment.entity';
import { GoodsReceiptItem } from '../../entities/inventory/goods-receipt-item.entity';
import { GoodsReceipt } from '../../entities/inventory/goods-receipt.entity';
import { Material } from '../../entities/master/material.entity';
import { Organization } from '../../entities/master/organization.entity';
import { RejectReason } from '../../entities/master/reject-reason.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { AccessControlModule } from '../access-control/access-control.module';
import { GoodsReceiptAttachmentStorageService } from './goods-receipt-attachment-storage.service';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      GoodsReceipt,
      GoodsReceiptItem,
      GoodsReceiptAttachment,
      DocumentCounter,
      Organization,
      Supplier,
      SupplierMaterial,
      Material,
      Unit,
      RejectReason,
    ]),
  ],
  controllers: [GoodsReceiptsController],
  providers: [
    GoodsReceiptsService,
    GoodsReceiptAttachmentStorageService,
    PermissionGuard,
  ],
  exports: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
