import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAnyPermissions } from '../../common/decorators/require-any-permissions.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AddGoodsReceiptAttachmentsDto } from './dto/add-goods-receipt-attachments.dto';
import { CancelGoodsReceiptDto } from './dto/cancel-goods-receipt.dto';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { ListGoodsReceiptsQueryDto } from './dto/list-goods-receipts-query.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';
import type { GoodsReceiptAttachmentFile } from './goods-receipt-attachment-storage.service';
import {
  GOODS_RECEIPT_ATTACHMENT_MAX_SIZE,
  GoodsReceiptAttachmentStorageService,
} from './goods-receipt-attachment-storage.service';
import { GOODS_RECEIPT_PERMISSIONS } from './goods-receipt-permissions';
import { GoodsReceiptsService } from './goods-receipts.service';

@Controller('goods-receipts')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class GoodsReceiptsController {
  constructor(
    private readonly goodsReceiptsService: GoodsReceiptsService,
    private readonly attachmentStorage: GoodsReceiptAttachmentStorageService,
  ) {}

  @Get()
  @RequirePermissions(GOODS_RECEIPT_PERMISSIONS.VIEW)
  findAll(@Query() query: ListGoodsReceiptsQueryDto) {
    return this.goodsReceiptsService.findAll(query);
  }

  @Get('lookups')
  @RequirePermissions(GOODS_RECEIPT_PERMISSIONS.VIEW)
  getLookups(@Query('supplierId') supplierId?: string) {
    return this.goodsReceiptsService.getLookups(supplierId);
  }

  @Get(':id')
  @RequirePermissions(GOODS_RECEIPT_PERMISSIONS.VIEW)
  findOne(@Param('id') id: string) {
    return this.goodsReceiptsService.findOne(id);
  }

  @Post()
  @RequirePermissions(GOODS_RECEIPT_PERMISSIONS.CREATE)
  create(
    @Body() dto: CreateGoodsReceiptDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.goodsReceiptsService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(GOODS_RECEIPT_PERMISSIONS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGoodsReceiptDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.goodsReceiptsService.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(GOODS_RECEIPT_PERMISSIONS.DELETE)
  remove(@Param('id') id: string) {
    return this.goodsReceiptsService.remove(id);
  }

  @Post(':id/post')
  @RequirePermissions(GOODS_RECEIPT_PERMISSIONS.POST)
  post(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.goodsReceiptsService.post(id, userId);
  }

  @Post(':id/cancel')
  @RequirePermissions(GOODS_RECEIPT_PERMISSIONS.CANCEL)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelGoodsReceiptDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.goodsReceiptsService.cancel(id, dto, userId);
  }

  @Post(':id/attachments')
  @RequireAnyPermissions(
    GOODS_RECEIPT_PERMISSIONS.CREATE,
    GOODS_RECEIPT_PERMISSIONS.UPDATE,
  )
  addAttachments(
    @Param('id') id: string,
    @Body() dto: AddGoodsReceiptAttachmentsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.goodsReceiptsService.addAttachments(id, dto, userId);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(GOODS_RECEIPT_PERMISSIONS.UPDATE)
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.goodsReceiptsService.removeAttachment(id, attachmentId);
  }

  @Post('attachments')
  @RequireAnyPermissions(
    GOODS_RECEIPT_PERMISSIONS.CREATE,
    GOODS_RECEIPT_PERMISSIONS.UPDATE,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: GOODS_RECEIPT_ATTACHMENT_MAX_SIZE },
    }),
  )
  stageAttachment(@UploadedFile() file: GoodsReceiptAttachmentFile) {
    return this.attachmentStorage.stage(file);
  }
}
