import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Material } from '../../entities/master/material.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import {
  ListMaterialInventoryQueryDto,
  MaterialStockStatus,
} from './dto/list-material-inventory-query.dto';

const CURRENT_STOCK_SQL = 'COALESCE(stock.quantity, 0)';
const LAST_RECEIVED_SQL = `(
  SELECT MAX(receiving.receive_date)
  FROM inventory.material_receivings receiving
  WHERE receiving.material_id = material.id
    AND receiving.status = 'confirmed'
)`;

export function classifyMaterialStock(
  currentStock: number,
  minimumStock: number,
): MaterialStockStatus {
  if (currentStock <= 0) return 'OUT_OF_STOCK';
  if (currentStock < minimumStock) return 'LOW_STOCK';
  return 'NORMAL';
}

export interface StockBalanceResponse {
  materialId: string;
  materialCode: string;
  materialName: string;
  quantity: string;
  unitCode: string;
  unitNameTh: string;
  lastMovementAt: string | null;
}

@Injectable()
export class StockBalancesService {
  constructor(
    @InjectRepository(StockBalance)
    private stockBalanceRepository: Repository<StockBalance>,
    @InjectRepository(Material)
    private materialRepository: Repository<Material>,
  ) {}

  async getMaterialInventory(query: ListMaterialInventoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const base = this.applyInventoryFilters(
      this.materialRepository
        .createQueryBuilder('material')
        .leftJoin(StockBalance, 'stock', 'stock.materialId = material.id'),
      query,
      false,
    );

    const summaryRaw = await base
      .clone()
      .select('COUNT(*)', 'total')
      .addSelect(
        `COUNT(*) FILTER (WHERE ${CURRENT_STOCK_SQL} > 0 AND ${CURRENT_STOCK_SQL} >= material.minimumStock)`,
        'normal',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE ${CURRENT_STOCK_SQL} > 0 AND ${CURRENT_STOCK_SQL} < material.minimumStock)`,
        'lowStock',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE ${CURRENT_STOCK_SQL} <= 0)`,
        'outOfStock',
      )
      .getRawOne<{
        total: string;
        normal: string;
        lowStock: string;
        outOfStock: string;
      }>();

    const filtered = this.applyStockStatusFilter(
      base.clone(),
      query.stockStatus,
    );
    const totalItems = await filtered.clone().getCount();
    const sortExpressions = {
      code: 'material.code',
      name: 'material.name',
      currentStock: CURRENT_STOCK_SQL,
      lastReceivedAt: LAST_RECEIVED_SQL,
    } as const;
    const rows = await filtered
      .select('material.id', 'materialId')
      .addSelect(CURRENT_STOCK_SQL, 'currentStock')
      .addSelect('stock.lastMovementAt', 'lastMovementAt')
      .addSelect(LAST_RECEIVED_SQL, 'lastReceivedAt')
      .orderBy(
        sortExpressions[query.sortBy ?? 'code'],
        query.sortOrder === 'desc' ? 'DESC' : 'ASC',
        query.sortBy === 'lastReceivedAt' ? 'NULLS LAST' : undefined,
      )
      .addOrderBy('material.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{
        materialId: string;
        currentStock: string;
        lastMovementAt: Date | string | null;
        lastReceivedAt: string | null;
      }>();

    const ids = rows.map((row) => row.materialId);
    const materials = ids.length
      ? await this.materialRepository.find({
          where: { id: In(ids) },
          relations: [
            'unit',
            'model',
            'deliveryType',
            'loadingPoint',
            'supplierMaterials',
            'supplierMaterials.supplier',
          ],
        })
      : [];
    const materialsById = new Map(
      materials.map((material) => [material.id, material]),
    );

    return {
      items: rows.flatMap((row) => {
        const material = materialsById.get(row.materialId);
        if (!material) return [];
        const currentStock = row.currentStock ?? '0';
        return [
          {
            ...this.mapInventoryMaterial(material),
            currentStock,
            stockStatus: classifyMaterialStock(
              Number(currentStock),
              Number(material.minimumStock),
            ),
            lastMovementAt: row.lastMovementAt
              ? new Date(row.lastMovementAt).toISOString()
              : null,
            lastReceivedAt: row.lastReceivedAt ?? null,
          },
        ];
      }),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
      summary: {
        total: Number(summaryRaw?.total ?? 0),
        normal: Number(summaryRaw?.normal ?? 0),
        lowStock: Number(summaryRaw?.lowStock ?? 0),
        outOfStock: Number(summaryRaw?.outOfStock ?? 0),
      },
    };
  }

  private applyInventoryFilters(
    queryBuilder: SelectQueryBuilder<Material>,
    query: ListMaterialInventoryQueryDto,
    includeStockStatus: boolean,
  ): SelectQueryBuilder<Material> {
    if (query.search) {
      queryBuilder.andWhere(
        '(material.code ILIKE :search OR material.name ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('material.isActive = :isActive', {
        isActive: query.isActive,
      });
    }
    if (query.type) {
      queryBuilder.andWhere('material.type = :type', { type: query.type });
    }
    if (query.modelId) {
      queryBuilder.andWhere('material.modelId = :modelId', {
        modelId: query.modelId,
      });
    }
    if (query.loadingPointId) {
      queryBuilder.andWhere('material.loadingPointId = :loadingPointId', {
        loadingPointId: query.loadingPointId,
      });
    }
    if (query.processLineName) {
      queryBuilder.andWhere('material.processLineName ILIKE :processLineName', {
        processLineName: `%${query.processLineName}%`,
      });
    }
    if (query.supplierId) {
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1 FROM master.supplier_materials supplier_filter
          INNER JOIN master.suppliers supplier
            ON supplier.id = supplier_filter.supplier_id
          WHERE supplier_filter.material_id = material.id
            AND supplier_filter.supplier_id = :supplierId
            AND supplier_filter.is_active = TRUE
            AND supplier.is_active = TRUE
        )`,
        { supplierId: query.supplierId },
      );
    }
    return includeStockStatus
      ? this.applyStockStatusFilter(queryBuilder, query.stockStatus)
      : queryBuilder;
  }

  private applyStockStatusFilter(
    queryBuilder: SelectQueryBuilder<Material>,
    status?: MaterialStockStatus | null,
  ): SelectQueryBuilder<Material> {
    if (status === 'OUT_OF_STOCK') {
      queryBuilder.andWhere(`${CURRENT_STOCK_SQL} <= 0`);
    } else if (status === 'LOW_STOCK') {
      queryBuilder.andWhere(
        `${CURRENT_STOCK_SQL} > 0 AND ${CURRENT_STOCK_SQL} < material.minimumStock`,
      );
    } else if (status === 'NORMAL') {
      queryBuilder.andWhere(
        `${CURRENT_STOCK_SQL} > 0 AND ${CURRENT_STOCK_SQL} >= material.minimumStock`,
      );
    }
    return queryBuilder;
  }

  private mapInventoryMaterial(material: Material) {
    const {
      supplierMaterials,
      unit,
      model,
      deliveryType,
      loadingPoint,
      ...fields
    } = material;
    const suppliers = (supplierMaterials ?? [])
      .filter((mapping) => mapping.isActive && mapping.supplier?.isActive)
      .map((mapping) => mapping.supplier)
      .sort((first, second) => first.code.localeCompare(second.code));
    return {
      ...fields,
      unit: unit ?? null,
      model: model ?? null,
      deliveryType: deliveryType ?? null,
      loadingPoint: loadingPoint ?? null,
      suppliers,
    };
  }

  async getByMaterialId(materialId: string): Promise<StockBalanceResponse> {
    const material = await this.materialRepository.findOne({
      where: { id: materialId },
      relations: ['unit'],
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    const stockBalance = await this.stockBalanceRepository.findOne({
      where: { materialId },
    });

    return {
      materialId,
      materialCode: material.code,
      materialName: material.name,
      quantity: stockBalance?.quantity ?? '0',
      unitCode: material.unit?.code ?? '',
      unitNameTh: material.unit?.nameTh ?? '',
      lastMovementAt: stockBalance?.lastMovementAt?.toISOString() ?? null,
    };
  }

  async getAll(): Promise<StockBalanceResponse[]> {
    const stockBalances = await this.stockBalanceRepository.find({
      relations: ['material', 'material.unit'],
    });

    return stockBalances.map((sb) => ({
      materialId: sb.materialId,
      materialCode: sb.material?.code ?? '',
      materialName: sb.material?.name ?? '',
      quantity: sb.quantity,
      unitCode: sb.material?.unit?.code ?? '',
      unitNameTh: sb.material?.unit?.nameTh ?? '',
      lastMovementAt: sb.lastMovementAt?.toISOString() ?? null,
    }));
  }
}
