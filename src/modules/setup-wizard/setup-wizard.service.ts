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

  async remove(id: string, ownerId: string) {
    const result = await this.connection.getRepository(SetupDraft).delete({ id, ownerId });
    if (!result.affected) throw new NotFoundException('ไม่พบร่างของคุณ');
    return { success: true };
  }
}
