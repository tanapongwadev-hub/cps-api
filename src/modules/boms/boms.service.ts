import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Material } from '../../entities/master/material.entity';
import { ProductBom, ProductBomItem, BomStatus } from '../../entities/master/product-bom.entity';
import { Unit } from '../../entities/master/unit.entity';
import { CreateBomDto } from './dto/create-bom.dto';
import { UpdateBomDto } from './dto/update-bom.dto';
import { AddBomItemDto } from './dto/update-bom.dto';

export type BomWithItems = Omit<ProductBom, 'items' | 'product'> & {
  product: { id: string; code: string; nameTh: string };
  items: Array<{
    id: string;
    materialId: string;
    materialCode: string;
    materialName: string;
    sortOrder: number;
    quantity: number;
    unitId: string;
    unitNameTh: string;
    isScrap: boolean;
    wastagePercent: number | null;
    remark: string | null;
  }>;
};

@Injectable()
export class BomsService {
  private readonly logger = new Logger(BomsService.name);

  constructor(
    @InjectRepository(ProductBom)
    private bomRepository: Repository<ProductBom>,
    @InjectRepository(Material)
    private materialRepository: Repository<Material>,
    @InjectRepository(Unit)
    private unitRepository: Repository<Unit>,
    private dataSource?: DataSource,
  ) {}

  private getDataSource(): DataSource {
    return this.dataSource!;
  }

  private buildBomResponse(bom: ProductBom): BomWithItems {
    const items = (bom.items ?? []).map((item) => ({
      id: item.id,
      materialId: item.materialId,
      materialCode: (item as any).material?.code ?? '',
      materialName: (item as any).material?.name ?? '',
      sortOrder: item.sortOrder,
      quantity: Number(item.quantity),
      unitId: item.unitId,
      unitNameTh: (item as any).unit?.nameTh ?? '',
      isScrap: item.isScrap,
      wastagePercent: item.wastagePercent ? Number(item.wastagePercent) : null,
      remark: item.remark,
    }));

    return {
      id: bom.id,
      productId: bom.productId,
      version: bom.version,
      status: bom.status,
      specification: bom.specification,
      remark: bom.remark,
      effectiveFrom: bom.effectiveFrom,
      effectiveTo: bom.effectiveTo,
      createdBy: bom.createdBy,
      updatedBy: bom.updatedBy,
      createdAt: bom.createdAt,
      updatedAt: bom.updatedAt,
      product: ( bom as any).product ?? { id: bom.productId, code: '', nameTh: '' },
      items,
    };
  }

  /**
   * Reload a BOM with all relations and return the API response shape.
   * MUST be called inside a transaction (using the manager) so the join
   * columns see the row just saved/updated. Using the outer repository
   * from inside a transaction can hit a different connection that has not
   * yet observed the in-flight write, which previously caused
   * `ProductBom with id N not found` right after create/update.
   */
  private async reloadInsideTransaction(
    manager: import('typeorm').EntityManager,
    id: string,
  ): Promise<BomWithItems> {
    const bom = await manager.getRepository(ProductBom).findOne({
      where: { id },
      relations: ['items', 'items.material', 'items.unit'],
    });
    if (!bom) throw new NotFoundException(`BOM with id ${id} not found after write`);
    return this.buildBomResponse(bom);
  }

  async findByProduct(productId: string): Promise<BomWithItems[]> {
    const boms = await this.bomRepository.find({
      where: { productId },
      relations: ['items', 'items.material', 'items.unit'],
      order: { createdAt: 'DESC' },
    });
    return boms.map((bom) => this.buildBomResponse(bom));
  }

  async findOne(id: string): Promise<BomWithItems> {
    const bom = await this.bomRepository.findOne({
      where: { id },
      relations: ['items', 'items.material', 'items.unit'],
    });
    if (!bom) throw new NotFoundException(`BOM with id ${id} not found`);
    return this.buildBomResponse(bom);
  }

  async create(dto: CreateBomDto, userId: string): Promise<BomWithItems> {
    return this.getDataSource().transaction(async (manager) => {
      const bomRepo = manager.getRepository(ProductBom);
      const matRepo = manager.getRepository(Material);
      const unitRepo = manager.getRepository(Unit);

      // Validate product exists
      const productBomRepo = bomRepo;
      const existingForProduct = await productBomRepo.find({
        where: { productId: dto.productId },
        order: { createdAt: 'DESC' },
      });

      // Calculate next version
      const latestVersion = existingForProduct.length > 0
        ? existingForProduct[0].version
        : 'v0';
      const nextVersionNum = parseInt(latestVersion.replace(/^v/, ''), 10) + 1;
      const version = `v${nextVersionNum}`;

      // Validate material references
      const materialIds = [...new Set(dto.items.map((i) => i.materialId))];
      const materials = await matRepo.findByIds(materialIds);
      if (materials.length !== materialIds.length) {
        throw new ConflictException('One or more material IDs are invalid');
      }

      // Validate unit references
      const unitIds = [...new Set(dto.items.map((i) => i.unitId))];
      const units = await unitRepo.findByIds(unitIds);
      if (units.length !== unitIds.length) {
        throw new ConflictException('One or more unit IDs are invalid');
      }

      const bom = bomRepo.create({
        productId: dto.productId,
        version,
        status: BomStatus.DRAFT,
        specification: dto.specification ?? null,
        remark: dto.remark ?? null,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        createdBy: userId,
        items: dto.items.map((item, idx) => ({
          materialId: item.materialId,
          sortOrder: idx + 1,
          quantity: item.quantity,
          unitId: item.unitId,
          isScrap: item.isScrap ?? false,
          wastagePercent: item.wastagePercent ?? null,
          remark: item.remark ?? null,
        })),
      });

      const saved = await bomRepo.save(bom);
      return this.reloadInsideTransaction(manager, saved.id);
    });
  }

  async update(
    id: string,
    dto: UpdateBomDto,
    userId: string,
  ): Promise<BomWithItems> {
    return this.getDataSource().transaction(async (manager) => {
      const bomRepo = manager.getRepository(ProductBom);
      const bom = await bomRepo.findOne({ where: { id } });
      if (!bom) throw new NotFoundException(`BOM with id ${id} not found`);
      if (bom.status === BomStatus.ACTIVE) {
        throw new BadRequestException('Cannot update an ACTIVE BOM. Deactivate it first.');
      }

      if (dto.specification !== undefined) bom.specification = dto.specification;
      if (dto.remark !== undefined) bom.remark = dto.remark;
      if (dto.effectiveFrom !== undefined) {
        bom.effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : null;
      }
      if (dto.effectiveTo !== undefined) {
        bom.effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
      }
      bom.updatedBy = userId;

      await bomRepo.save(bom);
      return this.reloadInsideTransaction(manager, id);
    });
  }

  async addItem(
    bomId: string,
    dto: AddBomItemDto,
    userId: string,
  ): Promise<BomWithItems> {
    return this.getDataSource().transaction(async (manager) => {
      const bomRepo = manager.getRepository(ProductBom);
      const bom = await bomRepo.findOne({ where: { id: bomId } });
      if (!bom) throw new NotFoundException(`BOM with id ${bomId} not found`);
      if (bom.status === BomStatus.ACTIVE) {
        throw new BadRequestException('Cannot add item to an ACTIVE BOM');
      }

      const itemRepo = manager.getRepository(ProductBomItem);

      const maxSort = bom.items?.length
        ? Math.max(...bom.items.map((i) => i.sortOrder))
        : 0;

      const newItem = itemRepo.create({
        bomId,
        materialId: dto.materialId,
        sortOrder: maxSort + 1,
        quantity: dto.quantity,
        unitId: dto.unitId,
        isScrap: dto.isScrap ?? false,
        wastagePercent: dto.wastagePercent ?? null,
        remark: dto.remark ?? null,
        createdBy: userId,
      });

      await itemRepo.save(newItem);
      return this.reloadInsideTransaction(manager, bomId);
    });
  }

  async removeItem(
    bomId: string,
    itemId: string,
    userId: string,
  ): Promise<BomWithItems> {
    return this.getDataSource().transaction(async (manager) => {
      const bomRepo = manager.getRepository(ProductBom);
      const itemRepo = manager.getRepository(ProductBomItem);

      const bom = await bomRepo.findOne({ where: { id: bomId } });
      if (!bom) throw new NotFoundException(`BOM with id ${bomId} not found`);
      if (bom.status === BomStatus.ACTIVE) {
        throw new BadRequestException('Cannot remove item from an ACTIVE BOM');
      }

      const item = await itemRepo.findOne({ where: { id: itemId, bomId } });
      if (!item) throw new NotFoundException(`Item ${itemId} not found in BOM ${bomId}`);

      await itemRepo.remove(item);
      return this.reloadInsideTransaction(manager, bomId);
    });
  }

  async activate(id: string, userId: string): Promise<BomWithItems> {
    return this.getDataSource().transaction(async (manager) => {
      const bomRepo = manager.getRepository(ProductBom);

      // Deactivate all other ACTIVE BOMs for this product
      const bom = await bomRepo.findOne({ where: { id } });
      if (!bom) throw new NotFoundException(`BOM with id ${id} not found`);

      await bomRepo.update(
        { productId: bom.productId, status: BomStatus.ACTIVE },
        { status: BomStatus.INACTIVE, updatedBy: userId },
      );

      bom.status = BomStatus.ACTIVE;
      bom.updatedBy = userId;
      await bomRepo.save(bom);

      return this.reloadInsideTransaction(manager, id);
    });
  }

  async deactivate(id: string, userId: string): Promise<BomWithItems> {
    return this.getDataSource().transaction(async (manager) => {
      const bomRepo = manager.getRepository(ProductBom);
      const bom = await bomRepo.findOne({ where: { id } });
      if (!bom) throw new NotFoundException(`BOM with id ${id} not found`);

      bom.status = BomStatus.INACTIVE;
      bom.updatedBy = userId;
      await bomRepo.save(bom);

      return this.reloadInsideTransaction(manager, id);
    });
  }

  async delete(id: string): Promise<void> {
    const bom = await this.bomRepository.findOne({ where: { id } });
    if (!bom) throw new NotFoundException(`BOM with id ${id} not found`);
    if (bom.status === BomStatus.ACTIVE) {
      throw new BadRequestException('Cannot delete an ACTIVE BOM. Deactivate it first.');
    }
    await this.bomRepository.remove(bom);
  }
}
