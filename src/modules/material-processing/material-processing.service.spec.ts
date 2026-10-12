import { ConflictException } from '@nestjs/common';
import { MaterialProcessingService, calculateProcessingOutput } from './material-processing.service';
import { MaterialProcessing } from '../../entities/inventory/material-processing.entity';
import { MaterialReceiving } from '../../entities/inventory/material-receiving.entity';
import { MaterialReceivingPackage } from '../../entities/inventory/material-receiving-package.entity';
import { StockBalance } from '../../entities/inventory/stock-balance.entity';
import { StockTransaction } from '../../entities/inventory/stock-transaction.entity';
import { AuditLog } from '../../entities/iam/audit-log.entity';
import { Material } from '../../entities/master/material.entity';

const payload = {
  requestKey: '04d06772-2663-4c2a-95e6-48f4ed8084e0', sourceReceivingId: '1', targetMaterialId: '2',
  sourceQuantity: 1, piecesPerUnit: 100, scrapQuantity: 0, packingQuantity: 50,
};
function setup(reserved = '2') {
  const source = { id: '1', materialId: '1', materialType: 'PIPE', status: 'confirmed',
    sourceReceivingId: null, receiveQuantity: '3', piecesQuantity: '3', processedQuantity: '0',
    internalLotNo: 'CCI-SOURCE', unitId: '10', receiveDate: '2026-10-01', supplierProductionDate: '2026-09-01' };
  const pkg = { id: '11', packageNo: 1, remainingQuantity: '3', quantity: '3', lotDetailNo: 'CCI-SOURCE-001', status: 'in_stock' };
  const balances: Record<string, { materialId: string; quantity: string }> = {
    '1': { materialId: '1', quantity: '3' }, '2': { materialId: '2', quantity: '0' },
  };
  const chain = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([pkg]), insert: jest.fn().mockReturnThis(), values: jest.fn().mockReturnThis(), orIgnore: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue({}) };
  const repository = () => ({ create: jest.fn((value) => value), save: jest.fn(async (value) => value) });
  const processRepo = { ...repository(), findOne: jest.fn().mockResolvedValue(null) };
  processRepo.save.mockImplementation(async (value) => ({ ...value, id: '99' }));
  const receivingRepo = { ...repository(), findOne: jest.fn().mockResolvedValue(source) };
  const packageRepo = { ...repository(), createQueryBuilder: jest.fn(() => chain) };
  const balanceRepo = { ...repository(), createQueryBuilder: jest.fn(() => chain), findOneOrFail: jest.fn(async (options) => balances[options.where.materialId]) };
  const stockRepo = repository();
  const auditRepo = repository();
  const repos = new Map<unknown, unknown>([[MaterialProcessing, processRepo], [MaterialReceiving, receivingRepo],
    [MaterialReceivingPackage, packageRepo], [StockBalance, balanceRepo], [StockTransaction, stockRepo],
    [AuditLog, auditRepo], [Material, { findOne: jest.fn().mockResolvedValue({ id: '2', isActive: true }) }]]);
  const manager = { getRepository: jest.fn((entity) => repos.get(entity)), query: jest.fn(async (sql: string) => sql.includes('production_plan_reservations') ? [{ package_id: '11', quantity: reserved }] : []) };
  const dataSource = { transaction: jest.fn(async (callback) => callback(manager)) };
  const receivingService = { receiveProcessedWithManager: jest.fn().mockResolvedValue({ id: '22', internalLotNo: 'CCI-OUTPUT' }) };
  return { service: new MaterialProcessingService(dataSource as never, receivingService as never), dataSource,
    manager, processRepo, receivingRepo, packageRepo, balanceRepo, stockRepo, auditRepo, receivingService, source, pkg };
}

describe('Material processing', () => {
  it('cuts one pipe into 100 pieces packed as two boxes of 50', () => {
    expect(calculateProcessingOutput(1, 100, 0, 50)).toEqual({ expectedQuantity: 100, outputQuantity: 100, packageCount: 2 });
  });
  it('accounts for scrap and preserves a partial final box', () => {
    expect(calculateProcessingOutput(1, 100, 7, 50)).toEqual({ expectedQuantity: 100, outputQuantity: 93, packageCount: 2 });
  });
  it.each([[0, 100, 0, 50], [1, 100, 100, 50], [1, 100, 0, 0], [0.5, 100, 0, 50], [10000, 100, 0, 1]])('rejects invalid or excessive output %p', (source, yieldPerUnit, scrap, pack) => {
    expect(() => calculateProcessingOutput(source, yieldPerUnit, scrap, pack)).toThrow();
  });
  it('consumes only unreserved source quantity and links the new receipt atomically', async () => {
    const fixture = setup();
    const result = await fixture.service.process(payload, '9');
    expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.pkg.remainingQuantity).toBe('2.0000');
    expect(fixture.source.processedQuantity).toBe('1.0000');
    expect(fixture.receivingService.receiveProcessedWithManager).toHaveBeenCalledWith(fixture.manager, fixture.source,
      expect.objectContaining({ materialId: '2', receiveQuantity: '100', packingQuantityOverride: 50 }), '9');
    expect(result.sourceReceivingId).toBe('1');
    expect(result.outputReceivingId).toBe('22');
    expect(result.sourcePackages).toEqual([{ packageId: '11', lotDetailNo: 'CCI-SOURCE-001', quantity: '1.0000' }]);
    expect(fixture.stockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ quantityOut: '1.0000', subQrId: '11' }));
    expect(fixture.auditRepo.save).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'material_processing.completed', outcome: 'SUCCESS' }));
  });
  it('rejects reserved quantity without creating stock or output', async () => {
    const fixture = setup('3');
    await expect(fixture.service.process(payload, '9')).rejects.toThrow(ConflictException);
    expect(fixture.receivingService.receiveProcessedWithManager).not.toHaveBeenCalled();
    expect(fixture.stockRepo.save).not.toHaveBeenCalled();
  });
  it('propagates output failures so the transaction can roll back', async () => {
    const fixture = setup();
    fixture.receivingService.receiveProcessedWithManager.mockRejectedValue(new Error('QR creation failed'));
    await expect(fixture.service.process(payload, '9')).rejects.toThrow('QR creation failed');
    expect(fixture.processRepo.save).not.toHaveBeenCalled();
    expect(fixture.auditRepo.save).not.toHaveBeenCalled();
  });
  it('rejects processing beyond the original source quantity', async () => {
    const fixture = setup();
    fixture.source.processedQuantity = '3';
    await expect(fixture.service.process(payload, '9')).rejects.toThrow(ConflictException);
    expect(fixture.receivingService.receiveProcessedWithManager).not.toHaveBeenCalled();
  });
  it('requires a distinct destination Material', async () => {
    const fixture = setup();
    await expect(fixture.service.process({ ...payload, targetMaterialId: '1' }, '9')).rejects.toThrow('Material ปลายทางต้องแยกจากต้นทาง');
    expect(fixture.stockRepo.save).not.toHaveBeenCalled();
  });
  it('replays an identical request without consuming its source twice', async () => {
    const fixture = setup();
    const previous = { ...payload, id: '99', code: 'MP-CCI-OUTPUT', createdBy: '9', sourceQuantity: '1.0000', remark: null };
    fixture.processRepo.findOne.mockResolvedValue(previous);
    expect(await fixture.service.process(payload, '9')).toEqual(previous);
    expect(fixture.receivingRepo.findOne).not.toHaveBeenCalled();
    expect(fixture.stockRepo.save).not.toHaveBeenCalled();
  });
});
