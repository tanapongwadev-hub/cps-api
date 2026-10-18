import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SetupDraft } from '../../entities/master/setup-draft.entity';
import { SaveSetupDraftDto } from './dto/save-setup-draft.dto';

@Injectable()
export class SetupWizardService {
  constructor(@InjectDataSource() private readonly connection: DataSource) {}

  list(ownerId: string) {
    return this.connection.getRepository(SetupDraft).find({
      select: ['id', 'title', 'step', 'updatedAt'],
      where: { ownerId },
      order: { updatedAt: 'DESC' },
    });
  }

  async get(id: string, ownerId: string) {
    const draft = await this.connection.getRepository(SetupDraft).findOne({ where: { id, ownerId } });
    if (!draft) throw new NotFoundException('ไม่พบร่างของคุณ');
    return draft;
  }

  async save(dto: SaveSetupDraftDto, ownerId: string) {
    if (JSON.stringify(dto.data).length > 256000) throw new BadRequestException('ข้อมูลร่างมีขนาดใหญ่เกินไป');
    return this.connection.transaction(async (manager) => {
      const repository = manager.getRepository(SetupDraft);
      if (!dto.id) {
        return repository.save(repository.create({ ownerId, title: dto.title, step: dto.step, data: dto.data }));
      }
      const existing = await repository.findOne({ where: { id: dto.id, ownerId }, lock: { mode: 'pessimistic_write' } });
      if (!existing) throw new NotFoundException('ไม่พบร่างของคุณ');
      if (!dto.updatedAt || existing.updatedAt.getTime() !== new Date(dto.updatedAt).getTime()) {
        throw new ConflictException('ร่างถูกแก้ไขจากหน้าต่างอื่น กรุณาเปิดร่างอีกครั้ง');
      }
      existing.title = dto.title;
      existing.step = dto.step;
      existing.data = dto.data;
      return repository.save(existing);
    });
  }

  /** Active products and materials that already have at least one BOM and one workflow. */
  async overview() {
    const build = (ownerTable: string, bomTable: string, workflowTable: string, col: string) =>
      this.connection.query(
        `SELECT o.id, o.code, o.name,
                (SELECT count(*) FROM master.${bomTable} b WHERE b.${col} = o.id)::int AS "bomCount",
                (SELECT count(*) FROM master.${bomTable} b WHERE b.${col} = o.id AND b.status = 'ACTIVE')::int AS "bomActive",
                (SELECT count(*) FROM master.${workflowTable} w WHERE w.${col} = o.id)::int AS "workflowCount",
                (SELECT count(*) FROM master.${workflowTable} w WHERE w.${col} = o.id AND w.status = 'ACTIVE')::int AS "workflowActive"
         FROM master.${ownerTable} o
         WHERE o.is_active = true
           AND EXISTS (SELECT 1 FROM master.${bomTable} b WHERE b.${col} = o.id)
           AND EXISTS (SELECT 1 FROM master.${workflowTable} w WHERE w.${col} = o.id)
         ORDER BY o.code`,
      ) as Promise<Array<Record<string, unknown>>>;
    const [products, materials] = await Promise.all([
      build('products', 'product_boms', 'product_workflows', 'product_id'),
      build('materials', 'material_boms', 'material_workflows', 'material_id'),
    ]);
    return { products, materials };
  }

  async remove(id: string, ownerId: string) {
    const result = await this.connection.getRepository(SetupDraft).delete({ id, ownerId });
    if (!result.affected) throw new NotFoundException('ไม่พบร่างของคุณ');
    return { success: true };
  }
}
