import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Product } from '../../entities/master/product.entity';
import { ProductStockMovement } from '../../entities/inventory/product-stock-movement.entity';
import { CreateProductStockMovementDto } from './dto/create-product-stock-movement.dto';

const signedQuantity = `CASE WHEN movement.type = 'receive' THEN movement.quantity ELSE -movement.quantity END`;

@Injectable()
export class ProductStockService {
  constructor(private readonly dataSource: DataSource) {}

  async balances() {
    return this.dataSource.getRepository(ProductStockMovement)
      .createQueryBuilder('movement')
      .select('movement.productId', 'productId')
      .addSelect(`SUM(${signedQuantity})::text`, 'quantity')
      .groupBy('movement.productId')
      .getRawMany<{ productId: string; quantity: string }>();
  }

  private async snapshot(manager: EntityManager, productId: string) {
    const totals = await manager.getRepository(ProductStockMovement)
      .createQueryBuilder('movement')
      .select(`COALESCE(SUM(${signedQuantity}), 0)::text`, 'quantity')
      .addSelect(`COALESCE(SUM(CASE WHEN movement.type = 'receive' THEN movement.quantity ELSE 0 END), 0)::text`, 'receivedQuantity')
      .addSelect(`COALESCE(SUM(CASE WHEN movement.type = 'issue' THEN movement.quantity ELSE 0 END), 0)::text`, 'issuedQuantity')
      .where('movement.productId = :productId', { productId })
      .getRawOne<{ quantity: string; receivedQuantity: string; issuedQuantity: string }>();
    const movements = await manager.getRepository(ProductStockMovement)
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.actor', 'actor')
      .select(['movement', 'actor.id', 'actor.username'])
      .where('movement.productId = :productId', { productId })
      .orderBy('movement.id', 'DESC').take(50).getMany();
    return {
      productId, ...totals!,
      movements: movements.map(({ actor, ...movement }) => ({ ...movement, actorName: actor?.username ?? '—' })),
    };
  }

  private assertId(id: string) {
    if (!/^[1-9]\d*$/.test(id)) throw new BadRequestException('Invalid product id');
  }

  async getStock(productId: string) {
    this.assertId(productId);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      if (!await manager.getRepository(Product).existsBy({ id: productId })) {
        throw new NotFoundException('Product not found');
      }
      return this.snapshot(manager, productId);
    });
  }

  async record(productId: string, dto: CreateProductStockMovementDto, userId: string) {
    this.assertId(productId);
    return this.dataSource.transaction(async (manager) => {
      // Serialize all receipt/issue writes for a product, including its first receipt.
      const product = await manager.getRepository(Product).createQueryBuilder('product')
        .where('product.id = :productId', { productId }).setLock('pessimistic_write').getOne();
      if (!product) throw new NotFoundException('Product not found');
      const repository = manager.getRepository(ProductStockMovement);
      const quantity = dto.quantity.toFixed(4);
      const referenceNo = dto.referenceNo.trim();
      const remark = dto.remark?.trim() || null;
      const existing = await repository.findOneBy({ productId, requestId: dto.requestId });
      if (existing) {
        if (existing.type !== dto.type || existing.quantity !== quantity || existing.referenceNo !== referenceNo || existing.remark !== remark || existing.recordedBy !== userId) {
          throw new ConflictException('รหัสคำขอนี้ถูกใช้กับรายการอื่นแล้ว');
        }
        return this.snapshot(manager, productId);
      }
      if (!product.isActive) throw new BadRequestException('ไม่สามารถบันทึกสต็อกสินค้าที่ปิดใช้งาน');
      // Do balance arithmetic in PostgreSQL NUMERIC to retain all four decimal places.
      const next = await repository.createQueryBuilder('movement')
        .select(`(COALESCE(SUM(${signedQuantity}), 0) + CAST(:delta AS numeric))::text`, 'quantity')
        .where('movement.productId = :productId', { productId })
        .setParameter('delta', dto.type === 'receive' ? quantity : `-${quantity}`)
        .getRawOne<{ quantity: string }>();
      if (!next || next.quantity.startsWith('-')) throw new BadRequestException('จำนวนจ่ายออกเกินสินค้าคงเหลือ');
      await repository.save(repository.create({ productId, requestId: dto.requestId, type: dto.type, quantity,
        balanceAfter: next.quantity, referenceNo, remark, recordedBy: userId }));
      return this.snapshot(manager, productId);
    });
  }
}
