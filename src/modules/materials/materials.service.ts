import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { DeliveryType } from '../../entities/master/delivery-type.entity';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { MaterialModel } from '../../entities/master/material-model.entity';
import { Material } from '../../entities/master/material.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import {
  ListMaterialsQueryDto,
  MaterialSortBy,
} from './dto/list-materials-query.dto';

const MATERIAL_SORT_COLUMNS: Record<MaterialSortBy, string> = {
  code: 'material.code',
  name: 'material.name',
  isActive: 'material.isActive',
  createdAt: 'material.createdAt',
  updatedAt: 'material.updatedAt',
};

export type MaterialWithSuppliers = Omit<Material, 'supplierMaterials'> & {
  suppliers: Supplier[];
};

@Injectable()
export class MaterialsService {
  constructor(
    @InjectRepository(Material)
    private materialRepository: Repository<Material>,
    @InjectRepository(Unit)
    private unitRepository: Repository<Unit>,
    @InjectRepository(Supplier)
    private supplierRepository: Repository<Supplier>,
    @InjectRepository(MaterialModel)
    private modelRepository: Repository<MaterialModel>,
    @InjectRepository(DeliveryType)
    private deliveryTypeRepository: Repository<DeliveryType>,
    @InjectRepository(LoadingPoint)
    private loadingPointRepository: Repository<LoadingPoint>,
  ) {}

  async findAll(query: ListMaterialsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder = this.createReadQuery();

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
    if (query.unitId) {
      queryBuilder.andWhere('material.unitId = :unitId', {
        unitId: query.unitId,
      });
    }
    if (query.modelId) {
      queryBuilder.andWhere('material.modelId = :modelId', {
        modelId: query.modelId,
      });
    }
    if (query.deliveryTypeId) {
      queryBuilder.andWhere('material.deliveryTypeId = :deliveryTypeId', {
        deliveryTypeId: query.deliveryTypeId,
      });
    }
    if (query.loadingPointId) {
      queryBuilder.andWhere('material.loadingPointId = :loadingPointId', {
        loadingPointId: query.loadingPointId,
      });
    }
    if (query.supplierId) {
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1
          FROM master.supplier_materials supplier_filter
          INNER JOIN master.suppliers supplier_filter_supplier
            ON supplier_filter_supplier.id = supplier_filter.supplier_id
          WHERE supplier_filter.material_id = material.id
            AND supplier_filter.supplier_id = :supplierId
            AND supplier_filter.is_active = TRUE
            AND supplier_filter_supplier.is_active = TRUE
        )`,
        { supplierId: query.supplierId },
      );
    }

    const sortColumn =
      MATERIAL_SORT_COLUMNS[query.sortBy] ?? MATERIAL_SORT_COLUMNS.code;
    const sortOrder = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const [materials, totalItems] = await queryBuilder
      .orderBy(sortColumn, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: materials.map((material) => this.mapSuppliers(material)),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async findOne(id: string): Promise<MaterialWithSuppliers> {
    const material = await this.createReadQuery()
      .where('material.id = :id', { id })
      .getOne();

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    return this.mapSuppliers(material);
  }

  async getLookups() {
    const lookupOptions = {
      where: { isActive: true },
      order: { code: 'ASC' as const },
    };
    const [units, suppliers, models, deliveryTypes, loadingPoints] =
      await Promise.all([
        this.unitRepository.find(lookupOptions),
        this.supplierRepository.find(lookupOptions),
        this.modelRepository.find(lookupOptions),
        this.deliveryTypeRepository.find(lookupOptions),
        this.loadingPointRepository.find(lookupOptions),
      ]);

    return { units, suppliers, models, deliveryTypes, loadingPoints };
  }

  private createReadQuery(): SelectQueryBuilder<Material> {
    return this.materialRepository
      .createQueryBuilder('material')
      .leftJoinAndSelect('material.unit', 'unit')
      .leftJoinAndSelect('material.model', 'model')
      .leftJoinAndSelect('material.deliveryType', 'deliveryType')
      .leftJoinAndSelect('material.loadingPoint', 'loadingPoint')
      .leftJoinAndSelect(
        'material.supplierMaterials',
        'supplierMaterial',
        'supplierMaterial.isActive = :supplierMaterialIsActive',
        { supplierMaterialIsActive: true },
      )
      .leftJoinAndSelect(
        'supplierMaterial.supplier',
        'supplier',
        'supplier.isActive = :supplierIsActive',
        { supplierIsActive: true },
      );
  }

  private mapSuppliers(material: Material): MaterialWithSuppliers {
    const suppliers = (material.supplierMaterials ?? [])
      .filter(
        (supplierMaterial: SupplierMaterial) =>
          supplierMaterial.isActive && supplierMaterial.supplier?.isActive,
      )
      .map((supplierMaterial) => supplierMaterial.supplier)
      .sort((first, second) => first.code.localeCompare(second.code));
    const result = { ...material, suppliers } as MaterialWithSuppliers & {
      supplierMaterials?: SupplierMaterial[];
    };
    delete result.supplierMaterials;
    return result;
  }
}
