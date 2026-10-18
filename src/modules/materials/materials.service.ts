import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { DeliveryType } from '../../entities/master/delivery-type.entity';
import { MaterialTypeMaster } from '../../entities/master/material-type.entity';
import { LoadingPoint } from '../../entities/master/loading-point.entity';
import { MaterialModel } from '../../entities/master/material-model.entity';
import { Material, MaterialLocationType, MaterialShape } from '../../entities/master/material.entity';
import { MaterialDraft } from '../../entities/master/material-draft.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { Supplier } from '../../entities/master/supplier.entity';
import { Unit } from '../../entities/master/unit.entity';
import { CreateMaterialDto } from './dto/create-material.dto';
import { MaterialProcessingOutputDto } from './dto/material-processing-output.dto';
import {
  ListMaterialsQueryDto,
  MaterialSortBy,
} from './dto/list-materials-query.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { MaterialImageStorageService } from './material-image-storage.service';
import { MaterialDraftsService } from './material-drafts.service';
import { createTraceId, recordAuditEvent } from '../../common/stock-ledger';

const MATERIAL_SORT_COLUMNS: Record<MaterialSortBy, string> = {
  code: 'material.code',
  name: 'material.name',
  isActive: 'material.isActive',
  createdAt: 'material.createdAt',
  updatedAt: 'material.updatedAt',
};

export interface MaterialLookupResponse {
  id: string;
  code: string;
  isActive?: boolean;
  nameTh?: string;
  nameEn?: string | null;
  symbol?: string | null;
  description?: string | null;
}

export type MaterialWithSuppliers = Omit<
  Material,
  | 'supplierMaterials'
  | 'unit'
  | 'model'
  | 'deliveryType'
  | 'materialTypeMaster'
  | 'loadingPoint'
> & {
  type?: string | null;
  materialType?: string | null;
  ratio?: number | null;
  unit?: MaterialLookupResponse | null;
  model?: MaterialLookupResponse | null;
  deliveryType?: MaterialLookupResponse | null;
  materialTypeMaster?: MaterialLookupResponse | null;
  loadingPoint?: MaterialLookupResponse | null;
  suppliers: MaterialLookupResponse[];
};

type MasterLookupEntity =
  | Unit
  | Supplier
  | MaterialModel
  | DeliveryType
  | MaterialTypeMaster
  | LoadingPoint;

@Injectable()
export class MaterialsService {
  private readonly logger = new Logger(MaterialsService.name);

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
    @InjectRepository(MaterialTypeMaster)
    private materialTypeRepository: Repository<MaterialTypeMaster>,
    @InjectRepository(LoadingPoint)
    private loadingPointRepository: Repository<LoadingPoint>,
    private dataSource?: DataSource,
    private imageStorage?: MaterialImageStorageService,
    private drafts?: MaterialDraftsService,
  ) {}

  async create(
    dto: CreateMaterialDto,
    userId: string,
  ): Promise<MaterialWithSuppliers> {
    this.assertUniqueSupplierIds(dto.supplierIds);
    const resolvedRatio = this.resolveRatio(dto.materialType, dto.ratio);
    let promotedImagePath: string | undefined;
    let committedDraftImage: string | null = null;
    let committedOutputDraftImage: string | null = null;
    const outputImage: { promoted?: string; previous?: string | null } = {};
    try {
      const result = await this.getDataSource().transaction(async (manager) => {
        const draft = dto.draftId ? await this.requireDrafts().lockForCommit(manager, dto.draftId, userId, null, dto.draftUpdatedAt) : null;
        const materialRepository = manager.getRepository(Material);
        const unitRepository = manager.getRepository(Unit);
        const supplierRepository = manager.getRepository(Supplier);
        const modelRepository = manager.getRepository(MaterialModel);
        const deliveryTypeRepository = manager.getRepository(DeliveryType);
        const materialTypeRepository =
          manager.getRepository(MaterialTypeMaster);
        const loadingPointRepository = manager.getRepository(LoadingPoint);
        const supplierMaterialRepository =
          manager.getRepository(SupplierMaterial);
        const normalizedCode = this.normalizeCode(dto.code);

        await this.assertCodeAvailable(materialRepository, normalizedCode);
        await this.validateReferences(
          {
            unitId: dto.unitId,
            deliveryTypeId: dto.deliveryTypeId ?? null,
            materialTypeId: dto.materialTypeId ?? null,
            modelId: dto.modelId ?? null,
            loadingPointId: dto.loadingPointId ?? null,
            supplierIds: dto.supplierIds,
          },
          {
            unitRepository,
            supplierRepository,
            modelRepository,
            deliveryTypeRepository,
            materialTypeRepository,
            loadingPointRepository,
          },
        );
        if (dto.imagePath) {
          const incoming = draft?.imagePath === dto.imagePath ? await this.getImageStorage().copyDraftToTemporary(dto.imagePath) : dto.imagePath;
          promotedImagePath = await this.getImageStorage().promote(
            incoming,
          );
        }

        const material = materialRepository.create({
          code: normalizedCode,
          name: dto.name,
          type: dto.type ?? null,
          materialType: dto.materialType ?? null,
          locationType: dto.locationType ?? MaterialLocationType.EXTERNAL,
          ratio: resolvedRatio,
          unitId: dto.unitId,
          deliveryTypeId: dto.deliveryTypeId ?? null,
          materialTypeId: dto.materialTypeId ?? null,
          modelId: dto.modelId ?? null,
          loadingPointId: dto.loadingPointId ?? null,
          processLineName: dto.processLineName ?? null,
          scale: dto.scale ?? null,
          imagePath: promotedImagePath ?? null,
          specification: dto.specification ?? null,
          description: dto.description ?? null,
          packingQuantity: dto.packingQuantity ?? null,
          minimumStock: String(dto.minimumStock ?? 0),
          isActive: dto.isActive ?? true,
          createdBy: userId,
          updatedBy: userId,
        });
        await this.saveProcessingOutput(manager, material, dto.processingOutput, userId, outputImage, draft);
        const savedMaterial = await this.saveMaterial(
          materialRepository,
          material,
        );

        const mappings = (dto.supplierIds ?? []).map((supplierId) =>
          supplierMaterialRepository.create({
            materialId: savedMaterial.id,
            supplierId,
            isActive: true,
            createdBy: userId,
            updatedBy: userId,
          }),
        );
        if (mappings.length > 0) {
          await this.saveSupplierMaterials(
            supplierMaterialRepository,
            mappings,
          );
        }

        if (draft) {
          committedDraftImage = draft.imagePath;
          committedOutputDraftImage = typeof draft.data.outputImagePath === 'string' ? draft.data.outputImagePath : null;
          await manager.getRepository(MaterialDraft).remove(draft);
        }
        return this.findOneUsing(materialRepository, savedMaterial.id);
      });
      await this.drafts?.discardImage(committedDraftImage);
      await this.drafts?.discardImage(committedOutputDraftImage);
      if (outputImage.previous) await this.discardCommittedImage(outputImage.previous);
      return result;
    } catch (error) {
      await this.compensatePromotedImage(promotedImagePath);
      await this.compensatePromotedImage(outputImage.promoted);
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateMaterialDto,
    userId: string,
  ): Promise<MaterialWithSuppliers> {
    this.assertUniqueSupplierIds(dto.supplierIds);
    let promotedImagePath: string | undefined;
    let previousImagePath: string | null | undefined;
    let imageChanged = false;
    let committedDraftImage: string | null = null;
    let committedOutputDraftImage: string | null = null;
    const outputImage: { promoted?: string; previous?: string | null } = {};
    let result: MaterialWithSuppliers;
    try {
      result = await this.getDataSource().transaction(async (manager) => {
        const draft = dto.draftId ? await this.requireDrafts().lockForCommit(manager, dto.draftId, userId, id, dto.draftUpdatedAt) : null;
        if (draft && (!draft.materialUpdatedAt || draft.materialUpdatedAt.getTime() !== new Date(dto.updatedAt).getTime())) {
          throw new ConflictException('เวอร์ชันวัสดุต้นทางไม่ตรงกับร่าง');
        }
        if (draft?.outputUpdatedAt && dto.processingOutput && draft.outputUpdatedAt.getTime() !== new Date(dto.processingOutput.updatedAt ?? '').getTime()) {
          throw new ConflictException('เวอร์ชันวัสดุปลายทางไม่ตรงกับร่าง');
        }
        const materialRepository = manager.getRepository(Material);
        const unitRepository = manager.getRepository(Unit);
        const supplierRepository = manager.getRepository(Supplier);
        const modelRepository = manager.getRepository(MaterialModel);
        const deliveryTypeRepository = manager.getRepository(DeliveryType);
        const materialTypeRepository =
          manager.getRepository(MaterialTypeMaster);
        const loadingPointRepository = manager.getRepository(LoadingPoint);
        const supplierMaterialRepository =
          manager.getRepository(SupplierMaterial);
        const material = await materialRepository.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!material) {
          throw new NotFoundException('Material not found');
        }
        if (
          new Date(dto.updatedAt).getTime() !==
          new Date(material.updatedAt).getTime()
        ) {
          throw new ConflictException('Material has been updated');
        }

        const normalizedCode = dto.code
          ? this.normalizeCode(dto.code)
          : material.code;
        if (dto.code) {
          await this.assertCodeAvailable(
            materialRepository,
            normalizedCode,
            material.id,
          );
        }
        await this.validateReferences(
          {
            unitId: dto.unitId ?? material.unitId,
            deliveryTypeId:
              dto.deliveryTypeId === undefined
                ? material.deliveryTypeId
                : dto.deliveryTypeId,
            materialTypeId:
              dto.materialTypeId === undefined
                ? material.materialTypeId
                : dto.materialTypeId,
            modelId: dto.modelId === undefined ? material.modelId : dto.modelId,
            loadingPointId:
              dto.loadingPointId === undefined
                ? material.loadingPointId
                : dto.loadingPointId,
            supplierIds: dto.supplierIds,
          },
          {
            unitRepository,
            supplierRepository,
            modelRepository,
            deliveryTypeRepository,
            materialTypeRepository,
            loadingPointRepository,
          },
        );

        let effectiveDto = dto;
        if (dto.imagePath !== undefined) {
          previousImagePath = material.imagePath;
          imageChanged = dto.imagePath !== material.imagePath;
          if (imageChanged && dto.imagePath !== null) {
            const incoming = draft?.imagePath === dto.imagePath ? await this.getImageStorage().copyDraftToTemporary(dto.imagePath) : dto.imagePath;
            promotedImagePath = await this.getImageStorage().promote(
              incoming,
            );
            effectiveDto = { ...dto, imagePath: promotedImagePath };
          }
        }

        const resolvedRatio = this.resolveUpdateRatio(
          material,
          dto.materialType,
          dto.ratio,
        );
        if (
          dto.materialType !== undefined ||
          dto.ratio !== undefined ||
          resolvedRatio !== material.ratio
        ) {
          effectiveDto = { ...effectiveDto, ratio: resolvedRatio };
        }

        this.applyUpdate(material, effectiveDto, normalizedCode, userId);
        if (material.materialType !== MaterialShape.PCS &&
          await materialRepository.findOne({ where: { processingMaterialId: material.id } })) {
          throw new BadRequestException('วัสดุปลายทางที่เชื่อมโยงอยู่ต้องเป็นชนิด PCS');
        }
        await this.saveProcessingOutput(manager, material, dto.processingOutput, userId, outputImage, draft);
        await this.saveMaterial(materialRepository, material);
        if (dto.supplierIds !== undefined) {
          await this.synchronizeSuppliers(
            supplierMaterialRepository,
            material.id,
            dto.supplierIds,
            userId,
          );
        }
        if (draft) {
          committedDraftImage = draft.imagePath;
          committedOutputDraftImage = typeof draft.data.outputImagePath === 'string' ? draft.data.outputImagePath : null;
          await manager.getRepository(MaterialDraft).remove(draft);
        }
        return this.findOneUsing(materialRepository, material.id);
      });
    } catch (error) {
      await this.compensatePromotedImage(promotedImagePath);
      await this.compensatePromotedImage(outputImage.promoted);
      throw error;
    }

    await this.drafts?.discardImage(committedDraftImage);
    await this.drafts?.discardImage(committedOutputDraftImage);
    if (outputImage.previous) await this.discardCommittedImage(outputImage.previous);
    if (
      imageChanged &&
      previousImagePath &&
      previousImagePath !== result.imagePath
    ) {
      await this.discardCommittedImage(previousImagePath);
    }
    return result;
  }

  async deactivate(id: string, userId: string): Promise<MaterialWithSuppliers> {
    return this.setActive(id, false, userId);
  }

  async deletionCheck(id: string) {
    if (!/^[1-9]\d*$/.test(id)) throw new BadRequestException('Material ID ไม่ถูกต้อง');
    return this.getDataSource().transaction(async (manager) => {
      const material = await manager.getRepository(Material).findOne({ where: { id } });
      if (!material) throw new NotFoundException('Material not found');
      const blockers = await this.materialDeletionBlockers(manager, id);
      const blockersWithoutBom = await this.materialDeletionBlockers(manager, id, true);
      const usageCount = Number((await manager.query(
        'SELECT (SELECT COUNT(*) FROM master.material_bom_items WHERE material_id = $1) + (SELECT COUNT(*) FROM master.product_bom_items WHERE material_id = $1) AS n', [id]))[0]?.n ?? 0);
      const ownBomCount = Number((await manager.query('SELECT COUNT(*)::int AS n FROM master.material_boms WHERE material_id = $1', [id]))[0]?.n ?? 0);
      return {
        material: { id: material.id, code: material.code, name: material.name, locationType: material.locationType },
        canDelete: blockers.length === 0, blockers,
        // Blocked only by the material's own BOM: can be deleted together with it.
        ownBomCount, usageCount, canDeleteWithBom: blockers.length > 0 && blockersWithoutBom.length === 0,
      };
    });
  }

  private async materialDeletionBlockers(manager: EntityManager, id: string, ignoreOwnBom = false): Promise<string[]> {
    // Inspect every incoming FK, including CASCADE/SET NULL links, to protect
    // historical records and new modules without maintaining a partial list.
    const references: { tableName: string; relation: string; columnName: string }[] = await manager.query(`
      SELECT c.relname AS "tableName", quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS relation,
             quote_ident(a.attname) AS "columnName"
      FROM pg_constraint fk
      JOIN pg_class c ON c.oid = fk.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(fk.conkey)
      WHERE fk.contype = 'f' AND fk.confrelid = 'master.materials'::regclass
        AND NOT (n.nspname = 'master' AND c.relname = 'supplier_materials')
    `);
    const labels: Record<string, string> = {
      materials: 'วัสดุที่เชื่อมโยงปลายทางแปรรูป', stock_balances: 'ยอดสต็อก',
      stock_movements: 'ประวัติเคลื่อนไหวสต็อก', material_receivings: 'รายการรับเข้า',
      stock_transactions: 'ประวัติเคลื่อนไหวสต็อก', material_reservations: 'การจองวัสดุ',
      material_disbursement_items: 'รายการจ่ายออก', product_bom_items: 'BOM สินค้า',
      material_bom_items: 'ส่วนประกอบ BOM วัสดุ', material_boms: 'BOM วัสดุ',
      material_workflows: 'Workflow วัสดุ', material_processings: 'ประวัติแปรรูป',
      material_drafts: 'ร่างวัสดุ',
    };
    const blockers = new Set<string>();
    // Drafts store a material id without an entity relation/FK.
    if (await manager.getRepository(MaterialDraft).count({ where: { materialId: id } })) blockers.add('ร่างวัสดุ');
    for (const reference of references) {
      // A source material pointing at this one as its processed output is just a
      // link: it is cleared on delete (see deletePermanently), not a blocker.
      if (reference.tableName === 'materials' && reference.columnName === 'processing_material_id') continue;
      if (ignoreOwnBom && ['material_boms', 'material_workflows', 'material_bom_items', 'product_bom_items'].includes(reference.tableName)) continue;
      // Identifiers are quoted by PostgreSQL; the user-provided id stays bound.
      const rows = await manager.query(`SELECT 1 FROM ${reference.relation} WHERE ${reference.columnName} = $1 LIMIT 1`, [id]);
      if (rows.length) blockers.add(labels[reference.tableName] ?? 'ข้อมูลที่เชื่อมโยงวัสดุ');
    }
    return [...blockers];
  }

  async deletePermanently(id: string, confirmationCode: string, userId: string, includeBom = false) {
    if (!/^[1-9]\d*$/.test(id)) throw new BadRequestException('Material ID ไม่ถูกต้อง');
    try {
      return await this.getDataSource().transaction(async (manager) => {
        const repository = manager.getRepository(Material);
        const material = await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!material) throw new NotFoundException('Material not found');
        if (confirmationCode !== material.code) throw new BadRequestException('กรุณาพิมพ์รหัสวัสดุให้ตรงกับรายการที่ต้องการลบ');
        const blockers = await this.materialDeletionBlockers(manager, id, includeBom);
        if (blockers.length) throw new ConflictException(`ลบไม่ได้: มี${blockers.join(', ')} กรุณาปิดใช้งานแทน`);
        let deletedBoms = 0;
        if (includeBom) {
          // Items go with their BOM (ON DELETE CASCADE); plan lines that pinned a BOM are blockers above.
          // Lines in other BOMs (material and product) that use this material as a component.
          await manager.query('DELETE FROM master.material_bom_items WHERE material_id = $1', [id]);
          await manager.query('DELETE FROM master.product_bom_items WHERE material_id = $1', [id]);
          const removed = await manager.query('DELETE FROM master.material_boms WHERE material_id = $1 RETURNING id', [id]);
          deletedBoms = removed.length;
          // The material's own routing (workflow + steps) belongs to the same BOM & Workflow definition.
          await manager.query('DELETE FROM master.material_workflows WHERE material_id = $1', [id]);
        }
        const unlinked: { id: string }[] = await manager.query(
          'UPDATE master.materials SET processing_material_id = NULL, updated_at = now() WHERE processing_material_id = $1 RETURNING id', [id]);
        const before = { id, code: material.code, name: material.name, locationType: material.locationType, deletedBoms, unlinkedSourceMaterials: unlinked.map((row) => row.id) };
        await manager.getRepository(SupplierMaterial).delete({ materialId: id });
        await repository.delete(id);
        await recordAuditEvent(manager, { traceId: createTraceId(), action: 'DELETE', eventName: 'material.permanently_deleted', targetType: 'MATERIAL', targetId: id, performedBy: userId, before });
        return before;
      });
    } catch (error) {
      if ((error as { driverError?: { code?: string } }).driverError?.code === '23503') {
        throw new ConflictException('วัสดุมีข้อมูลอ้างอิงเพิ่มเติม กรุณาตรวจสอบอีกครั้งหรือปิดใช้งานแทน');
      }
      throw error;
    }
  }

  async restore(id: string, userId: string): Promise<MaterialWithSuppliers> {
    return this.setActive(id, true, userId);
  }

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
    if (query.materialTypeId) {
      queryBuilder.andWhere('material.materialTypeId = :materialTypeId', {
        materialTypeId: query.materialTypeId,
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
    if (query.type) {
      queryBuilder.andWhere('material.type = :type', {
        type: query.type,
      });
    }
    if (query.materialType) {
      queryBuilder.andWhere('material.materialType = :materialType', {
        materialType: query.materialType,
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
      .addOrderBy('material.id', 'ASC')
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
    return this.findOneUsing(this.materialRepository, id);
  }

  async checkCodeAvailability(code: string, excludeId?: string) {
    const query = this.materialRepository.createQueryBuilder('material')
      .where('LOWER(material.code) = LOWER(:code)', { code: this.normalizeCode(code) });
    if (excludeId) query.andWhere('material.id <> :excludeId', { excludeId });
    // Inactive codes are still reserved by the master table's unique index.
    return { available: (await query.getCount()) === 0 };
  }

  private requireDrafts(): MaterialDraftsService {
    if (!this.drafts) throw new BadRequestException('ระบบบันทึกร่างไม่พร้อมใช้งาน');
    return this.drafts;
  }

  private async findOneUsing(
    repository: Repository<Material>,
    id: string,
  ): Promise<MaterialWithSuppliers> {
    const material = await this.createReadQuery(repository)
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
    const [
      units,
      suppliers,
      models,
      deliveryTypes,
      materialTypes,
      loadingPoints,
    ] = await Promise.all([
      this.unitRepository.find(lookupOptions),
      this.supplierRepository.find(lookupOptions),
      this.modelRepository.find(lookupOptions),
      this.deliveryTypeRepository.find(lookupOptions),
      this.materialTypeRepository.find(lookupOptions),
      this.loadingPointRepository.find(lookupOptions),
    ]);

    return {
      units: units.map((unit) => this.mapLookup(unit)),
      suppliers: suppliers.map((supplier) => this.mapLookup(supplier)),
      models: models.map((model) => this.mapLookup(model)),
      deliveryTypes: deliveryTypes.map((deliveryType) =>
        this.mapLookup(deliveryType),
      ),
      materialTypes: materialTypes.map((materialType) =>
        this.mapLookup(materialType),
      ),
      loadingPoints: loadingPoints.map((loadingPoint) =>
        this.mapLookup(loadingPoint),
      ),
    };
  }

  private createReadQuery(
    repository: Repository<Material> = this.materialRepository,
  ): SelectQueryBuilder<Material> {
    return repository
      .createQueryBuilder('material')
      .leftJoinAndSelect('material.processingMaterial', 'processingMaterial')
      .leftJoinAndSelect('material.unit', 'unit')
      .leftJoinAndSelect('material.model', 'model')
      .leftJoinAndSelect('material.deliveryType', 'deliveryType')
      .leftJoinAndSelect('material.materialTypeMaster', 'materialTypeMaster')
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
      .sort((first, second) => first.code.localeCompare(second.code))
      .map((supplier) => this.mapLookup(supplier));

    const result: Record<string, unknown> = {};
    for (const field of [
      'id',
      'code',
      'name',
      'type',
      'materialType',
      'ratio',
      'processingMaterialId',
      'locationType',
      'unitId',
      'deliveryTypeId',
      'materialTypeId',
      'modelId',
      'loadingPointId',
      'processLineName',
      'scale',
      'imagePath',
      'specification',
      'description',
      'packingQuantity',
      'minimumStock',
      'isActive',
      'createdBy',
      'updatedBy',
      'createdAt',
      'updatedAt',
    ] as const) {
      if (field in material) {
        result[field] = material[field];
      }
    }

    for (const field of [
      'unit',
      'model',
      'deliveryType',
      'materialTypeMaster',
      'loadingPoint',
    ] as const) {
      if (field in material) {
        const lookup = material[field];
        result[field] = lookup ? this.mapLookup(lookup) : null;
      }
    }
    result.suppliers = suppliers;
    result.processingMaterial = material.processingMaterial ?? null;
    return result as MaterialWithSuppliers;
  }

  /** Save both datasets in the parent's transaction; existing stock/receipts are untouched. */
  private async saveProcessingOutput(
    manager: EntityManager,
    source: Material,
    dto: MaterialProcessingOutputDto | undefined,
    userId: string,
    imageChanges: { promoted?: string; previous?: string | null },
    draft: MaterialDraft | null,
  ): Promise<void> {
    if (source.materialType === MaterialShape.PCS) {
      if (dto) throw new BadRequestException('ข้อมูลหลังแปรรูปใช้ได้เฉพาะ PIPE, SHEET และ COIL');
      source.processingMaterialId = null;
      return;
    }
    if (!dto) return; // Compatible with existing callers and historical masters.
    if (source.materialType !== MaterialShape.PIPE && source.materialType !== MaterialShape.SHEET && source.materialType !== MaterialShape.COIL) {
      throw new BadRequestException('ข้อมูลหลังแปรรูปใช้ได้เฉพาะ PIPE, SHEET และ COIL');
    }
    if (!Number.isInteger(source.ratio) || Number(source.ratio) < 1 || Number(source.ratio) > 1000000) {
      throw new BadRequestException('จำนวนชิ้นต่อหน่วยต้นทางต้องเป็นจำนวนเต็ม 1–1,000,000');
    }
    const repository = manager.getRepository(Material);
    const code = this.normalizeCode(dto.code);
    if (code.toLowerCase() === source.code.toLowerCase()) {
      throw new BadRequestException('รหัสวัสดุหลังแปรรูปต้องต่างจากต้นทาง');
    }
    await this.assertActiveReference(manager.getRepository(Unit), dto.unitId, 'Unit');
    if (dto.modelId) await this.assertActiveReference(manager.getRepository(MaterialModel), dto.modelId, 'Material model');
    if (dto.loadingPointId) await this.assertActiveReference(manager.getRepository(LoadingPoint), dto.loadingPointId, 'Loading point');
    let output: Material;
    if (source.processingMaterialId) {
      const existing = await repository.findOne({
        where: { id: source.processingMaterialId }, lock: { mode: 'pessimistic_write' },
      });
      if (!existing) throw new NotFoundException('Material ปลายทางไม่พบ');
      if (!dto.updatedAt || new Date(dto.updatedAt).getTime() !== existing.updatedAt.getTime()) {
        throw new ConflictException('Material ปลายทางถูกแก้ไขแล้ว กรุณารีเฟรช');
      }
      if (existing.materialType !== MaterialShape.PCS || !existing.isActive) {
        throw new BadRequestException('Material ปลายทางต้องเป็น PCS และเปิดใช้งาน');
      }
      output = existing;
    } else {
      output = repository.create({
        materialType: MaterialShape.PCS, ratio: null, minimumStock: '0',
        type: source.type, materialTypeId: source.materialTypeId, modelId: source.modelId,
        deliveryTypeId: source.deliveryTypeId, loadingPointId: source.loadingPointId,
        processLineName: source.processLineName,
        isActive: true, createdBy: userId,
      });
    }
    await this.assertCodeAvailable(repository, code, output.id);
    Object.assign(output, {
      code, name: dto.name, unitId: dto.unitId,
      locationType: dto.locationType ?? output.locationType ?? MaterialLocationType.EXTERNAL,
      ...(dto.modelId !== undefined ? { modelId: dto.modelId } : {}),
      ...(dto.loadingPointId !== undefined ? { loadingPointId: dto.loadingPointId } : {}),
      ...(dto.processLineName !== undefined ? { processLineName: dto.processLineName } : {}),
      ...(dto.scale !== undefined ? { scale: dto.scale } : {}),
      packingQuantity: dto.packingQuantity, specification: dto.specification ?? null,
      updatedBy: userId,
    });
    if (dto.imagePath !== undefined && dto.imagePath !== output.imagePath) {
      imageChanges.previous = output.imagePath;
      if (dto.imagePath) {
        const incoming = draft?.data.outputImagePath === dto.imagePath
          ? await this.getImageStorage().copyDraftToTemporary(dto.imagePath) : dto.imagePath;
        imageChanges.promoted = await this.getImageStorage().promote(incoming);
        output.imagePath = imageChanges.promoted;
      } else {
        output.imagePath = null;
      }
    }
    source.processingMaterialId = (await this.saveMaterial(repository, output)).id;
  }

  private mapLookup(entity: MasterLookupEntity): MaterialLookupResponse {
    const result: Record<string, unknown> = {
      id: entity.id,
      code: entity.code,
    };
    for (const field of [
      'isActive',
      'nameTh',
      'nameEn',
      'symbol',
      'description',
    ] as const) {
      if (field in entity) {
        result[field] = Reflect.get(entity, field);
      }
    }
    return result as unknown as MaterialLookupResponse;
  }

  private getDataSource(): DataSource {
    if (!this.dataSource) {
      throw new Error('MaterialsService DataSource is not configured');
    }
    return this.dataSource;
  }

  private getImageStorage(): MaterialImageStorageService {
    if (!this.imageStorage) {
      throw new Error('MaterialsService image storage is not configured');
    }
    return this.imageStorage;
  }

  private async compensatePromotedImage(imagePath?: string): Promise<void> {
    if (!imagePath) return;
    try {
      await this.getImageStorage().discard(imagePath);
    } catch (error) {
      this.logger.error(
        `Failed to compensate Material image ${imagePath}`,
        error,
      );
    }
  }

  private async discardCommittedImage(imagePath: string): Promise<void> {
    try {
      await this.getImageStorage().discard(imagePath);
    } catch (error) {
      this.logger.warn(`Failed to discard Material image ${imagePath}`, error);
    }
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  /**
   * Enforce the rule:
   *   - `materialType = PCS`           => `ratio` must be null
   *   - `materialType = PIPE/SHEET/COIL` => `ratio` must be a positive integer
   *
   * Used by `create` where `materialType` and `ratio` are passed as-is from the DTO.
   */
  private resolveRatio(
    materialType: MaterialShape | null | undefined,
    ratio: number | null | undefined,
  ): number | null {
    if (materialType === MaterialShape.PCS) {
      if (ratio !== undefined && ratio !== null) {
        throw new BadRequestException(
          'ratio must be null when materialType is PCS',
        );
      }
      return null;
    }
    if (materialType === null || materialType === undefined) {
      if (ratio !== undefined && ratio !== null && ratio < 1) {
        throw new BadRequestException('ratio must be >= 1');
      }
      return ratio ?? null;
    }
    // materialType is PIPE / SHEET / COIL
    if (ratio === undefined || ratio === null) {
      throw new BadRequestException(
        `ratio is required when materialType is ${materialType}`,
      );
    }
    if (ratio < 1) {
      throw new BadRequestException('ratio must be >= 1');
    }
    return ratio;
  }

  /**
   * Used by `update`. The effective materialType = `dto.materialType` if provided,
   * otherwise the existing `material.materialType`. The returned ratio is what
   * the entity should end up with, and may overwrite `dto.ratio` before persistence.
   */
  private resolveUpdateRatio(
    material: Material,
    dtoMaterialType: MaterialShape | null | undefined,
    dtoRatio: number | null | undefined,
  ): number | null {
    const effectiveMaterialType =
      dtoMaterialType !== undefined ? dtoMaterialType : material.materialType;

    if (effectiveMaterialType === MaterialShape.PCS) {
      if (dtoRatio !== undefined && dtoRatio !== null) {
        throw new BadRequestException(
          'ratio must be null when materialType is PCS',
        );
      }
      return null;
    }
    if (effectiveMaterialType === null || effectiveMaterialType === undefined) {
      if (dtoRatio === undefined) return material.ratio ?? null;
      if (dtoRatio !== null && dtoRatio < 1) {
        throw new BadRequestException('ratio must be >= 1');
      }
      return dtoRatio ?? null;
    }
    // PIPE / SHEET / COIL
    if (dtoRatio === null) {
      throw new BadRequestException(
        `ratio is required when materialType is ${effectiveMaterialType}`,
      );
    }
    if (dtoRatio === undefined) {
      if (material.ratio === null || material.ratio === undefined) {
        throw new BadRequestException(
          `ratio is required when materialType is ${effectiveMaterialType}`,
        );
      }
      return material.ratio;
    }
    if (dtoRatio < 1) {
      throw new BadRequestException('ratio must be >= 1');
    }
    return dtoRatio;
  }

  private assertUniqueSupplierIds(supplierIds?: string[]): void {
    if (supplierIds && new Set(supplierIds).size !== supplierIds.length) {
      throw new BadRequestException('Supplier IDs must be unique');
    }
  }

  private async assertCodeAvailable(
    repository: Repository<Material>,
    code: string,
    currentId?: string,
  ): Promise<void> {
    const query = repository
      .createQueryBuilder('material')
      .where('LOWER(material.code) = LOWER(:code)', { code });
    if (currentId) {
      query.andWhere('material.id <> :currentId', { currentId });
    }
    if (await query.getOne()) {
      throw new ConflictException('Material code already exists');
    }
  }

  private async validateReferences(
    references: {
      unitId: string;
      deliveryTypeId: string | null;
      materialTypeId: string | null;
      modelId: string | null;
      loadingPointId: string | null;
      supplierIds?: string[];
    },
    repositories: {
      unitRepository: Repository<Unit>;
      supplierRepository: Repository<Supplier>;
      modelRepository: Repository<MaterialModel>;
      deliveryTypeRepository: Repository<DeliveryType>;
      materialTypeRepository: Repository<MaterialTypeMaster>;
      loadingPointRepository: Repository<LoadingPoint>;
    },
  ): Promise<void> {
    await this.assertActiveReference(
      repositories.unitRepository,
      references.unitId,
      'Unit',
    );
    if (references.deliveryTypeId) {
      await this.assertActiveReference(
        repositories.deliveryTypeRepository,
        references.deliveryTypeId,
        'Delivery type',
      );
    }
    if (references.materialTypeId) {
      await this.assertActiveReference(
        repositories.materialTypeRepository,
        references.materialTypeId,
        'Material type',
      );
    }
    if (references.modelId) {
      await this.assertActiveReference(
        repositories.modelRepository,
        references.modelId,
        'Material model',
      );
    }
    if (references.loadingPointId) {
      await this.assertActiveReference(
        repositories.loadingPointRepository,
        references.loadingPointId,
        'Loading point',
      );
    }
    if (references.supplierIds !== undefined) {
      await this.assertActiveSuppliers(
        repositories.supplierRepository,
        references.supplierIds,
      );
    }
  }

  private async assertActiveReference<
    T extends { id: string; isActive: boolean },
  >(repository: Repository<T>, id: string, label: string): Promise<void> {
    const reference = await repository.findOne({
      where: { id } as never,
      lock: { mode: 'pessimistic_read' },
    });
    if (!reference) {
      throw new NotFoundException(`${label} not found`);
    }
    if (!reference.isActive) {
      throw new BadRequestException(`${label} is inactive`);
    }
  }

  private async assertActiveSuppliers(
    repository: Repository<Supplier>,
    supplierIds: string[],
  ): Promise<void> {
    if (supplierIds.length === 0) return;
    const orderedIds = [...supplierIds].sort((first, second) => {
      const firstId = BigInt(first);
      const secondId = BigInt(second);
      return firstId < secondId ? -1 : firstId > secondId ? 1 : 0;
    });
    const found = await repository
      .createQueryBuilder('supplier')
      .where('supplier.id IN (:...supplierIds)', { supplierIds: orderedIds })
      .orderBy('supplier.id', 'ASC')
      .setLock('pessimistic_read')
      .getMany();
    const foundById = new Map(found.map((supplier) => [supplier.id, supplier]));
    const missingId = supplierIds.find((id) => !foundById.has(id));
    if (missingId) {
      throw new NotFoundException(`Supplier ${missingId} not found`);
    }
    const inactiveId = supplierIds.find((id) => !foundById.get(id)?.isActive);
    if (inactiveId) {
      throw new BadRequestException(`Supplier ${inactiveId} is inactive`);
    }
  }

  private applyUpdate(
    material: Material,
    dto: UpdateMaterialDto,
    normalizedCode: string,
    userId: string,
  ): void {
    if (dto.code !== undefined) material.code = normalizedCode;
    if (dto.locationType !== undefined) material.locationType = dto.locationType;
    for (const field of [
      'name',
      'type',
      'materialType',
      'ratio',
      'unitId',
      'deliveryTypeId',
      'materialTypeId',
      'modelId',
      'loadingPointId',
      'processLineName',
      'scale',
      'imagePath',
      'specification',
      'description',
      'packingQuantity',
      'minimumStock',
      'isActive',
    ] as const) {
      if (dto[field] !== undefined) {
        (material[field] as (typeof dto)[typeof field]) = dto[field];
      }
    }
    material.updatedBy = userId;
  }

  private async synchronizeSuppliers(
    repository: Repository<SupplierMaterial>,
    materialId: string,
    supplierIds: string[],
    userId: string,
  ): Promise<void> {
    const existing = await repository.find({ where: { materialId } });
    const requested = new Set(supplierIds);
    const existingBySupplier = new Map(
      existing.map((mapping) => [mapping.supplierId, mapping]),
    );
    const changed: SupplierMaterial[] = [];

    for (const mapping of existing) {
      const shouldBeActive = requested.has(mapping.supplierId);
      if (mapping.isActive !== shouldBeActive) {
        mapping.isActive = shouldBeActive;
        mapping.updatedBy = userId;
        changed.push(mapping);
      }
    }
    for (const supplierId of supplierIds) {
      if (!existingBySupplier.has(supplierId)) {
        changed.push(
          repository.create({
            materialId,
            supplierId,
            isActive: true,
            createdBy: userId,
            updatedBy: userId,
          }),
        );
      }
    }
    if (changed.length > 0) {
      await this.saveSupplierMaterials(repository, changed);
    }
  }

  private async saveSupplierMaterials(
    repository: Repository<SupplierMaterial>,
    mappings: SupplierMaterial[],
  ): Promise<SupplierMaterial[]> {
    try {
      return await repository.save(mappings);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Material supplier mapping already exists');
      }
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    const databaseError = error as {
      code?: string;
      driverError?: { code?: string };
    };
    return (
      databaseError.code === '23505' ||
      databaseError.driverError?.code === '23505'
    );
  }

  private async saveMaterial(
    repository: Repository<Material>,
    material: Material,
  ): Promise<Material> {
    try {
      return await repository.save(material);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Material code already exists');
      }
      throw error;
    }
  }

  private async setActive(
    id: string,
    isActive: boolean,
    userId: string,
  ): Promise<MaterialWithSuppliers> {
    return this.getDataSource().transaction(async (manager) => {
      const repository = manager.getRepository(Material);
      const material = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!material) {
        throw new NotFoundException('Material not found');
      }
      material.isActive = isActive;
      material.updatedBy = userId;
      await repository.save(material);
      return this.findOneUsing(repository, material.id);
    });
  }
}
