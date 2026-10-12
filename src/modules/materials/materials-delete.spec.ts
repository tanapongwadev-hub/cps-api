import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Material } from '../../entities/master/material.entity';
import { SupplierMaterial } from '../../entities/master/supplier-material.entity';
import { recordAuditEvent } from '../../common/stock-ledger';
import { MaterialsService } from './materials.service';

jest.mock('../../common/stock-ledger', () => ({ createTraceId: () => 'trace', recordAuditEvent: jest.fn() }));

function fixture() {
  const material = { id: '42', code: 'MAT-42', name: 'Test', locationType: 'internal' };
  const repository = { findOne: jest.fn().mockResolvedValue(material), delete: jest.fn().mockResolvedValue({ affected: 1 }), count: jest.fn().mockResolvedValue(0) };
  const mappings = { delete: jest.fn() };
  const query = jest.fn().mockResolvedValue([]);
  const manager = { getRepository: jest.fn((entity) => entity === SupplierMaterial ? mappings : repository), query };
  const dataSource = { transaction: jest.fn(async (work: (value: EntityManager) => Promise<unknown>) => work(manager as unknown as EntityManager)) };
  const unused = {} as Repository<Material>;
  const service = new MaterialsService(unused, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, dataSource as unknown as DataSource);
  return { service, repository, mappings, query, material };
}

describe('Material permanent deletion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects invalid and missing ids before deleting', async () => {
    const f = fixture();
    await expect(f.service.deletePermanently('not-an-id', 'MAT-42', '7')).rejects.toBeInstanceOf(BadRequestException);
    f.repository.findOne.mockResolvedValue(null);
    await expect(f.service.deletePermanently('42', 'MAT-42', '7')).rejects.toBeInstanceOf(NotFoundException);
    expect(f.repository.delete).not.toHaveBeenCalled();
  });

  it('requires the exact current material code', async () => {
    const f = fixture();
    await expect(f.service.deletePermanently('42', 'mat-42', '7')).rejects.toBeInstanceOf(BadRequestException);
    expect(f.repository.delete).not.toHaveBeenCalled();
  });

  it('blocks drafts even without a foreign key', async () => {
    const f = fixture();
    f.repository.count.mockResolvedValue(1);
    await expect(f.service.deletionCheck('42')).resolves.toMatchObject({ canDelete: false, blockers: ['ร่างวัสดุ'] });
    await expect(f.service.deletePermanently('42', 'MAT-42', '7')).rejects.toBeInstanceOf(ConflictException);
    expect(f.repository.delete).not.toHaveBeenCalled();
  });

  it('blocks any incoming reference, including cascading BOM ownership', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([{ tableName: 'material_boms', relation: '"master"."material_boms"', columnName: '"material_id"' }]).mockResolvedValueOnce([{ exists: 1 }]);
    await expect(f.service.deletePermanently('42', 'MAT-42', '7')).rejects.toBeInstanceOf(ConflictException);
    expect(f.mappings.delete).not.toHaveBeenCalled();
    expect(f.repository.delete).not.toHaveBeenCalled();
  });

  it('checks references with a bound id and reports blockers without mutation', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([{ tableName: 'material_receivings', relation: '"inventory"."material_receivings"', columnName: '"material_id"' }]).mockResolvedValueOnce([{ exists: 1 }]);
    await expect(f.service.deletionCheck('42')).resolves.toMatchObject({ canDelete: false, blockers: ['รายการรับเข้า'] });
    expect(f.query.mock.calls[1][1]).toEqual(['42']);
    expect(f.repository.delete).not.toHaveBeenCalled();
  });

  it('locks, deletes unused material and mappings, and records the actor', async () => {
    const f = fixture();
    await expect(f.service.deletePermanently('42', 'MAT-42', '7')).resolves.toMatchObject({ id: '42', code: 'MAT-42' });
    expect(f.repository.findOne).toHaveBeenCalledWith({ where: { id: '42' }, lock: { mode: 'pessimistic_write' } });
    expect(f.mappings.delete).toHaveBeenCalledWith({ materialId: '42' });
    expect(f.repository.delete).toHaveBeenCalledWith('42');
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventName: 'material.permanently_deleted', performedBy: '7', targetId: '42', before: expect.objectContaining({ code: 'MAT-42' }) }));
  });
});
