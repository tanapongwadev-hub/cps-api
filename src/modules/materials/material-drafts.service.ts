import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { MaterialDraft } from '../../entities/master/material-draft.entity';
import { Material } from '../../entities/master/material.entity';
import { SaveMaterialDraftDto } from './dto/save-material-draft.dto';
import { MaterialImageStorageService } from './material-image-storage.service';

const TEXT_FIELDS = ['code', 'name', 'materialType', 'locationType', 'unitId', 'deliveryTypeId', 'materialTypeId', 'modelId', 'loadingPointId', 'processLineName', 'scale', 'specification', 'description', 'outputCode', 'outputName', 'outputUnitId', 'outputLocationType', 'outputModelId', 'outputLoadingPointId', 'outputProcessLineName', 'outputScale', 'outputSpecification'];
const NUMBER_FIELDS = ['ratio', 'packingQuantity', 'minimumStock', 'outputPackingQuantity'];

@Injectable()
export class MaterialDraftsService {
  private readonly logger = new Logger(MaterialDraftsService.name);
  constructor(@InjectDataSource() private readonly connection: DataSource, private readonly images: MaterialImageStorageService) {}

  list(ownerId: string) {
    return this.connection.getRepository(MaterialDraft).createQueryBuilder('draft')
      .select(['draft.id AS id', 'draft.materialId AS "materialId"', 'draft.step AS step', 'draft.updatedAt AS "updatedAt"',
        `draft.data->>'code' AS code`, `draft.data->>'name' AS name`, `draft.data->>'materialType' AS "materialType"`])
      .where('draft.ownerId = :ownerId', { ownerId }).orderBy('draft.updatedAt', 'DESC').getRawMany();
  }

  async get(id: string, ownerId: string) {
    const draft = await this.connection.getRepository(MaterialDraft).findOne({ where: { id, ownerId } });
    if (!draft) throw new NotFoundException('ไม่พบร่างของคุณ');
    return draft;
  }

  async save(dto: SaveMaterialDraftDto, ownerId: string) {
    if (dto.materialId && !dto.materialUpdatedAt) throw new BadRequestException('ร่างแก้ไขต้องมีเวอร์ชันวัสดุต้นทาง');
    const data: Record<string, unknown> = {};
    for (const field of [...TEXT_FIELDS, ...NUMBER_FIELDS]) {
      const value = dto.data[field];
      if (value === undefined) continue;
      if (TEXT_FIELDS.includes(field) ? typeof value !== 'string' : value !== null && typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
        throw new BadRequestException('ข้อมูลร่างไม่ถูกต้อง');
      }
      data[field] = value === null ? '' : value;
    }
    if (data.materialType !== undefined && !['', 'PCS', 'PIPE', 'SHEET', 'COIL'].includes(String(data.materialType))) throw new BadRequestException('ชนิดเหล็กไม่ถูกต้อง');
    for (const field of ['locationType', 'outputLocationType']) {
      if (data[field] !== undefined && !['internal', 'external'].includes(String(data[field]))) {
        throw new BadRequestException('Location Type ต้องเป็น internal หรือ external');
      }
    }
    if (JSON.stringify(data).length > 128000 || dto.supplierIds.length > 1000) throw new BadRequestException('ข้อมูลร่างมีขนาดใหญ่เกินไป');
    const retainedImages: string[] = [];
    const replacedImages: string[] = [];
    try {
      const result = await this.connection.transaction(async (manager) => {
        const repository = manager.getRepository(MaterialDraft);
        const existing = dto.id ? await repository.findOne({ where: { id: dto.id, ownerId }, lock: { mode: 'pessimistic_write' } }) : null;
        if (dto.id && !existing) throw new NotFoundException('ไม่พบร่างของคุณ');
        if (existing && (!dto.updatedAt || existing.updatedAt.getTime() !== new Date(dto.updatedAt).getTime())) throw new ConflictException('ร่างถูกแก้ไขจากหน้าต่างอื่น กรุณาเปิดร่างอีกครั้ง');
        if (existing && existing.materialId !== (dto.materialId ?? null)) throw new BadRequestException('ไม่สามารถเปลี่ยนวัสดุของร่างได้');
        // Keep a concurrent permanent deletion from passing its draft check
        // while a new/edit draft is being saved (draft ids have no FK).
        if (dto.materialId && !await manager.getRepository(Material).findOne({ where: { id: dto.materialId }, lock: { mode: 'for_key_share' } })) throw new NotFoundException('Material not found');
        const draft = existing ?? repository.create({ ownerId, materialId: dto.materialId ?? null,
          materialUpdatedAt: dto.materialUpdatedAt ? new Date(dto.materialUpdatedAt) : null,
          outputUpdatedAt: dto.outputUpdatedAt ? new Date(dto.outputUpdatedAt) : null, imagePath: null });
        if (dto.imagePath !== undefined && dto.imagePath !== draft.imagePath) {
          if (draft.imagePath) replacedImages.push(draft.imagePath);
          const retained = dto.imagePath ? await this.images.retainDraftImage(dto.imagePath) : null;
          if (retained) retainedImages.push(retained);
          draft.imagePath = retained;
        }
        const previousOutputImage = typeof draft.data?.outputImagePath === 'string' ? draft.data.outputImagePath : null;
        let outputImage = previousOutputImage;
        if (dto.outputImagePath !== undefined && dto.outputImagePath !== previousOutputImage) {
          if (previousOutputImage) replacedImages.push(previousOutputImage);
          outputImage = dto.outputImagePath ? await this.images.retainDraftImage(dto.outputImagePath) : null;
          if (outputImage) retainedImages.push(outputImage);
        }
        data.outputImagePath = outputImage;
        draft.data = data; draft.step = dto.step; draft.supplierIds = dto.supplierIds;
        return repository.save(draft);
      });
      for (const image of replacedImages) await this.discardImage(image);
      return result;
    } catch (error) {
      for (const image of retainedImages) await this.discardImage(image);
      throw error;
    }
  }

  async remove(id: string, ownerId: string) {
    const image = await this.connection.transaction(async (manager) => {
      const draft = await this.lockForCommit(manager, id, ownerId);
      await manager.getRepository(MaterialDraft).remove(draft);
      return [draft.imagePath, typeof draft.data.outputImagePath === 'string' ? draft.data.outputImagePath : null];
    });
    for (const path of image) await this.discardImage(path);
    return { success: true };
  }

  async lockForCommit(manager: EntityManager, id: string, ownerId: string, materialId?: string | null, updatedAt?: string) {
    const draft = await manager.getRepository(MaterialDraft).findOne({ where: { id, ownerId }, lock: { mode: 'pessimistic_write' } });
    if (!draft) throw new NotFoundException('ไม่พบร่างของคุณ');
    if (materialId !== undefined && (draft.materialId !== materialId || !updatedAt || draft.updatedAt.getTime() !== new Date(updatedAt).getTime())) throw new ConflictException('ร่างเปลี่ยนแปลงแล้ว กรุณาเปิดร่างอีกครั้ง');
    return draft;
  }

  async discardImage(path?: string | null) {
    if (!path) return;
    try { await this.images.discard(path); }
    catch (error) { this.logger.warn('Failed to discard draft image', error); }
  }
}
