import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Material } from '../../entities/master/material.entity';
import { ProcessStep } from '../../entities/master/process-step.entity';
import { Unit } from '../../entities/master/unit.entity';
import { MaterialBom, MaterialBomItem, MaterialWorkflow, MaterialWorkflowStep, MaterialEngineeringVersion } from '../../entities/master/material-engineering.entity';
import { CreateMaterialBomDto, CreateMaterialWorkflowDto, UpdateMaterialBomDto, UpdateMaterialWorkflowDto } from './material-engineering.dto';

@Injectable()
export class MaterialEngineeringService {
  constructor(private readonly dataSource: DataSource) {}

  async materialIdsWithBom(): Promise<string[]> {
    const rows = await this.dataSource.getRepository(MaterialBom).createQueryBuilder('bom')
      .select('bom.materialId', 'materialId').distinct(true).getRawMany<{ materialId: string }>();
    return rows.map((row) => row.materialId);
  }

  /** Highest existing vN + 1 (not a row count: deleting a version must never reuse a live number). */
  private async nextVersion(repository: { find(options: { where: { materialId: string }; select: ['version'] }): Promise<Array<{ version: string }>> }, materialId: string) {
    const rows = await repository.find({ where: { materialId }, select: ['version'] });
    const highest = rows.reduce((max, row) => Math.max(max, parseInt(row.version.replace(/^v/, ''), 10) || 0), 0);
    return `v${highest + 1}`;
  }

  private assertId(id: string) {
    if (!/^[1-9]\d*$/.test(id)) throw new BadRequestException('Invalid material id');
  }

  private async lockOwner(manager: EntityManager, id: string) {
    this.assertId(id);
    const material = await manager.getRepository(Material).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!material) throw new NotFoundException('Material not found');
    if (!material.isActive) throw new BadRequestException('Material is inactive');
    return material;
  }

  async list(materialId: string, kind: 'bom' | 'workflow') {
    this.assertId(materialId);
    const manager = this.dataSource.manager;
    if (!await manager.getRepository(Material).existsBy({ id: materialId })) throw new NotFoundException('Material not found');
    if (kind === 'bom') {
      const versions = await manager.getRepository(MaterialBom).find({ where: { materialId }, order: { id: 'DESC' } });
      if (!versions.length) return [];
      const items: Array<{ bomId: string; id: string; materialId: string; materialCode: string; materialName: string; quantity: number; unitId: string; unitNameTh: string; sortOrder: number; isScrap: boolean; wastagePercent: number | null; remark: string | null }> = await manager.query(`
        SELECT i.id, i.bom_id AS "bomId", i.material_id AS "materialId", m.code AS "materialCode", m.name AS "materialName",
          i.quantity::float8 AS quantity, i.unit_id AS "unitId", u.name_th AS "unitNameTh", i.sort_order AS "sortOrder",
          i.is_scrap AS "isScrap", i.wastage_percent::float8 AS "wastagePercent", i.remark
        FROM master.material_bom_items i JOIN master.materials m ON m.id=i.material_id
        JOIN master.units u ON u.id=i.unit_id WHERE i.bom_id=ANY($1::bigint[]) ORDER BY i.sort_order`, [versions.map((v) => v.id)]);
      return versions.map((version) => ({ ...version, items: items.filter((item) => item.bomId === version.id) }));
    }
    const versions = await manager.getRepository(MaterialWorkflow).find({ where: { materialId }, order: { id: 'DESC' } });
    if (!versions.length) return [];
    const steps: Array<{ workflowId: string; id: string; processStepId: string; processStepCode: string; stepName: string; description: string | null; sortOrder: number }> = await manager.query(`
      SELECT s.id,s.workflow_id AS "workflowId",s.process_step_id AS "processStepId",p.code AS "processStepCode",
        p.name_th AS "stepName",s.description,s.sort_order AS "sortOrder"
      FROM master.material_workflow_steps s JOIN master.process_steps p ON p.id=s.process_step_id
      WHERE s.workflow_id=ANY($1::bigint[]) ORDER BY s.sort_order`, [versions.map((v) => v.id)]);
    return versions.map((version) => ({ ...version, steps: steps.filter((step) => step.workflowId === version.id) }));
  }

  private async validateBomItems(manager: EntityManager, ownerId: string, items: CreateMaterialBomDto['items']) {
    const ids = items.map((item) => item.materialId);
    if (ids.includes(ownerId) || new Set(ids).size !== ids.length) throw new BadRequestException('BOM ห้ามใช้ Material ปลายทางเป็นส่วนประกอบหรือเลือกซ้ำ');
    const materials = await manager.getRepository(Material).findBy({ id: In(ids), isActive: true });
    if (materials.length !== ids.length || items.some((item) => materials.find((m) => m.id === item.materialId)?.unitId !== item.unitId)) {
      throw new BadRequestException('Material หรือหน่วยส่วนประกอบไม่ถูกต้อง');
    }
    const unitIds = [...new Set(items.map((item) => item.unitId))];
    if (await manager.getRepository(Unit).countBy({ id: In(unitIds), isActive: true }) !== unitIds.length) throw new BadRequestException('หน่วยส่วนประกอบถูกปิดใช้งาน');
  }

  private bomItemRows(bomId: string, items: CreateMaterialBomDto['items'], manager: EntityManager) {
    return items.map((item, sortOrder) => manager.getRepository(MaterialBomItem).create({ bomId, materialId: item.materialId, unitId: item.unitId, quantity: item.quantity.toFixed(4), isScrap: item.isScrap ?? false, wastagePercent: item.wastagePercent == null ? null : item.wastagePercent.toFixed(4), remark: item.remark ?? null, sortOrder }));
  }

  /** Replace the content of a BOM that is not ACTIVE (DRAFT / INACTIVE). */
  async updateBom(id: string, dto: UpdateMaterialBomDto, userId: string) {
    this.assertId(id);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MaterialBom);
      const bom = await repository.findOneBy({ id });
      if (!bom) throw new NotFoundException('BOM not found');
      await this.lockOwner(manager, bom.materialId);
      if (bom.status === 'ACTIVE') throw new BadRequestException('แก้ไข BOM ที่เปิดใช้งานอยู่ไม่ได้ ให้ทำสำเนาเป็นเวอร์ชันใหม่หรือปิดใช้งานก่อน');
      await this.validateBomItems(manager, bom.materialId, dto.items);
      bom.specification = dto.specification ?? null;
      bom.remark = dto.remark ?? null;
      bom.updatedBy = userId;
      await repository.save(bom);
      await manager.getRepository(MaterialBomItem).delete({ bomId: id });
      await manager.getRepository(MaterialBomItem).save(this.bomItemRows(id, dto.items, manager));
      return bom;
    });
  }

  /** Permanently delete a BOM that is not ACTIVE. */
  async deleteBom(id: string) {
    this.assertId(id);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MaterialBom);
      const bom = await repository.findOneBy({ id });
      if (!bom) throw new NotFoundException('BOM not found');
      await this.lockOwner(manager, bom.materialId);
      if (bom.status === 'ACTIVE') throw new BadRequestException('ลบ BOM ที่เปิดใช้งานอยู่ไม่ได้ ต้องปิดใช้งานก่อน');
      await manager.getRepository(MaterialBomItem).delete({ bomId: id });
      await repository.delete({ id });
      return { id, deleted: true };
    });
  }

  async createBom(dto: CreateMaterialBomDto, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockOwner(manager, dto.materialId);
      await this.validateBomItems(manager, dto.materialId, dto.items);
      const repository = manager.getRepository(MaterialBom);
      const version = await this.nextVersion(repository, dto.materialId);
      const bom = await repository.save(repository.create({ materialId: dto.materialId, version, status: 'DRAFT', specification: dto.specification ?? null, remark: dto.remark ?? null, createdBy: userId, updatedBy: userId }));
      await manager.getRepository(MaterialBomItem).save(this.bomItemRows(bom.id, dto.items, manager));
      return bom;
    });
  }

  /** Replace the content of a workflow that is not ACTIVE (DRAFT / INACTIVE). */
  async updateWorkflow(id: string, dto: UpdateMaterialWorkflowDto, userId: string) {
    this.assertId(id);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MaterialWorkflow);
      const workflow = await repository.findOneBy({ id });
      if (!workflow) throw new NotFoundException('Workflow not found');
      await this.lockOwner(manager, workflow.materialId);
      if (workflow.status === 'ACTIVE') throw new BadRequestException('แก้ไข Workflow ที่เปิดใช้งานอยู่ไม่ได้ ให้ทำสำเนาเป็นเวอร์ชันใหม่หรือปิดใช้งานก่อน');
      const ids = [...new Set(dto.steps.map((step) => step.processStepId))];
      if (await manager.getRepository(ProcessStep).countBy({ id: In(ids), isActive: true }) !== ids.length) throw new BadRequestException('Process step is invalid or inactive');
      workflow.remark = dto.remark ?? null;
      workflow.updatedBy = userId;
      await repository.save(workflow);
      await manager.getRepository(MaterialWorkflowStep).delete({ workflowId: id });
      await manager.getRepository(MaterialWorkflowStep).save(dto.steps.map((step, sortOrder) => ({ workflowId: id, processStepId: step.processStepId, description: step.description ?? null, sortOrder })));
      return workflow;
    });
  }

  /** Permanently delete a workflow that is not ACTIVE. */
  async deleteWorkflow(id: string) {
    this.assertId(id);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MaterialWorkflow);
      const workflow = await repository.findOneBy({ id });
      if (!workflow) throw new NotFoundException('Workflow not found');
      await this.lockOwner(manager, workflow.materialId);
      if (workflow.status === 'ACTIVE') throw new BadRequestException('ลบ Workflow ที่เปิดใช้งานอยู่ไม่ได้ ต้องปิดใช้งานก่อน');
      await manager.getRepository(MaterialWorkflowStep).delete({ workflowId: id });
      await repository.delete({ id });
      return { id, deleted: true };
    });
  }

  async createWorkflow(dto: CreateMaterialWorkflowDto, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockOwner(manager, dto.materialId);
      const ids = [...new Set(dto.steps.map((step) => step.processStepId))];
      if (await manager.getRepository(ProcessStep).countBy({ id: In(ids), isActive: true }) !== ids.length) throw new BadRequestException('Process step is invalid or inactive');
      const repository = manager.getRepository(MaterialWorkflow);
      const version = await this.nextVersion(repository, dto.materialId);
      const workflow = await repository.save(repository.create({ materialId: dto.materialId, version, status: 'DRAFT', remark: dto.remark ?? null, createdBy: userId, updatedBy: userId }));
      await manager.getRepository(MaterialWorkflowStep).save(dto.steps.map((step, sortOrder) => ({ workflowId: workflow.id, processStepId: step.processStepId, description: step.description ?? null, sortOrder })));
      return workflow;
    });
  }

  async activate(kind: 'bom' | 'workflow', id: string, userId: string) {
    this.assertId(id);
    return this.dataSource.transaction(async (manager) => {
      // Serialize activations across owners so cross-material BOM cycles cannot race.
      if (kind === 'bom') await manager.query('SELECT pg_advisory_xact_lock(1790600021)');
      const entity = kind === 'bom' ? MaterialBom : MaterialWorkflow;
      const repository = manager.getRepository<MaterialEngineeringVersion>(entity);
      const version = await repository.findOneBy({ id });
      if (!version) throw new NotFoundException('Version not found');
      await this.lockOwner(manager, version.materialId);
      if (kind === 'bom') {
        const invalid: { invalid: boolean }[] = await manager.query(`SELECT EXISTS (
          SELECT 1 FROM master.material_bom_items i JOIN master.materials m ON m.id=i.material_id JOIN master.units u ON u.id=i.unit_id
          WHERE i.bom_id=$1 AND (NOT m.is_active OR NOT u.is_active OR m.unit_id<>i.unit_id)) AS invalid`, [id]);
        if (invalid[0].invalid) throw new BadRequestException('ส่วนประกอบหรือหน่วยใน BOM ไม่พร้อมใช้งาน');
        const cycles: { cycle: boolean }[] = await manager.query(`WITH RECURSIVE edges AS (
          SELECT b.material_id AS parent,i.material_id AS child FROM master.material_boms b
          JOIN master.material_bom_items i ON i.bom_id=b.id WHERE b.status='ACTIVE' AND b.material_id<>$1
          UNION ALL SELECT $1::bigint,i.material_id FROM master.material_bom_items i WHERE i.bom_id=$2
        ), reachable AS (SELECT child FROM edges WHERE parent=$1 UNION SELECT e.child FROM edges e JOIN reachable r ON e.parent=r.child)
        SELECT EXISTS(SELECT 1 FROM reachable WHERE child=$1) AS cycle`, [version.materialId, id]);
        if (cycles[0].cycle) throw new BadRequestException('BOM นี้ทำให้เกิดวงจรการใช้ Material');
      } else {
        const invalid: { invalid: boolean }[] = await manager.query(`SELECT EXISTS (
          SELECT 1 FROM master.material_workflow_steps s JOIN master.process_steps p ON p.id=s.process_step_id
          WHERE s.workflow_id=$1 AND NOT p.is_active) AS invalid`, [id]);
        if (invalid[0].invalid) throw new BadRequestException('ขั้นตอนใน Workflow ถูกปิดใช้งาน');
      }
      await repository.update({ materialId: version.materialId, status: 'ACTIVE' }, { status: 'INACTIVE', updatedBy: userId });
      await repository.update({ id }, { status: 'ACTIVE', updatedBy: userId });
      return { id, status: 'ACTIVE' };
    });
  }
}
