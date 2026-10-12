import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Material } from '../../entities/master/material.entity';
import { MaterialEngineeringService } from './material-engineering.service';

function fixture() {
  const owners = { findOne: jest.fn().mockResolvedValue({ id: '1', isActive: true }), findBy: jest.fn() };
  const versions = { findOneBy: jest.fn().mockResolvedValue({ id: '10', materialId: '1' }), update: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity: unknown) => entity === Material ? owners : versions),
    query: jest.fn(),
  };
  const source = { transaction: jest.fn(async (work: (value: typeof manager) => Promise<unknown>) => work(manager)) };
  return { service: new MaterialEngineeringService(source as unknown as DataSource), owners, versions, manager };
}

describe('Material engineering safeguards', () => {
  it('rejects using the destination Material as a BOM component', async () => {
    const { service, versions } = fixture();
    await expect(service.createBom({ materialId: '1', items: [{ materialId: '1', quantity: 1, unitId: '2' }] }, '7')).rejects.toThrow(BadRequestException);
    expect(versions.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate components before creating a version', async () => {
    const { service, owners } = fixture();
    await expect(service.createBom({ materialId: '1', items: [{ materialId: '2', quantity: 1, unitId: '3' }, { materialId: '2', quantity: 2, unitId: '3' }] }, '7')).rejects.toThrow(BadRequestException);
    expect(owners.findBy).not.toHaveBeenCalled();
  });

  it('preserves the current active version if activation would introduce a BOM cycle', async () => {
    const { service, manager, versions } = fixture();
    manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ invalid: false }]).mockResolvedValueOnce([{ cycle: true }]);
    await expect(service.activate('bom', '10', '7')).rejects.toThrow('BOM นี้ทำให้เกิดวงจรการใช้ Material');
    expect(versions.update).not.toHaveBeenCalled();
  });
});
