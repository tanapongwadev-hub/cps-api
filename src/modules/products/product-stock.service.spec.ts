import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Product } from '../../entities/master/product.entity';
import { ProductStockService } from './product-stock.service';

function queryBuilder() {
  const builder = {
    where: jest.fn(), setLock: jest.fn(), select: jest.fn(), addSelect: jest.fn(),
    setParameter: jest.fn(), leftJoinAndSelect: jest.fn(), orderBy: jest.fn(), take: jest.fn(),
    getOne: jest.fn(), getRawOne: jest.fn(), getMany: jest.fn(),
  };
  for (const method of ['where', 'setLock', 'select', 'addSelect', 'setParameter', 'leftJoinAndSelect', 'orderBy', 'take'] as const) {
    builder[method].mockReturnValue(builder);
  }
  return builder;
}

function fixture() {
  const productQuery = queryBuilder();
  productQuery.getOne.mockResolvedValue({ id: '1', isActive: true });
  const movementQuery = queryBuilder();
  movementQuery.getRawOne.mockResolvedValue({ quantity: '0.0000', receivedQuantity: '5.0000', issuedQuantity: '5.0000' });
  movementQuery.getMany.mockResolvedValue([]);
  const movements = {
    createQueryBuilder: jest.fn().mockReturnValue(movementQuery),
    findOneBy: jest.fn().mockResolvedValue(null),
    create: jest.fn((entry: unknown) => entry),
    save: jest.fn().mockResolvedValue({ id: '10' }),
  };
  const manager = { getRepository: jest.fn((entity: unknown) => entity === Product
    ? { createQueryBuilder: () => productQuery } : movements) };
  const dataSource = { transaction: jest.fn(async (work: (value: typeof manager) => Promise<unknown>) => work(manager)) };
  const service = new ProductStockService(dataSource as unknown as DataSource);
  return { service, productQuery, movementQuery, movements };
}

const payload = { requestId: '9a91fc82-ed44-4cb4-bfba-4438d03c550c', type: 'issue' as const, quantity: 5, referenceNo: 'DEL-001', remark: '' };

describe('ProductStockService recording safeguards', () => {
  it('rejects an issue exceeding available stock without saving a movement', async () => {
    const { service, movementQuery, movements, productQuery } = fixture();
    movementQuery.getRawOne.mockResolvedValue({ quantity: '-0.0001' });
    await expect(service.record('1', payload, '7')).rejects.toThrow(BadRequestException);
    expect(movements.save).not.toHaveBeenCalled();
    expect(productQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
  });

  it('allows issuing the exact remaining balance', async () => {
    const { service, movements } = fixture();
    await expect(service.record('1', payload, '7')).resolves.toMatchObject({ quantity: '0.0000' });
    expect(movements.save).toHaveBeenCalledWith(expect.objectContaining({ type: 'issue', quantity: '5.0000', balanceAfter: '0.0000', recordedBy: '7' }));
  });

  it('replays the same request without issuing twice', async () => {
    const { service, movements } = fixture();
    movements.findOneBy.mockResolvedValue({ ...payload, quantity: '5.0000', remark: null, recordedBy: '7' });
    await expect(service.record('1', payload, '7')).resolves.toMatchObject({ quantity: '0.0000' });
    expect(movements.save).not.toHaveBeenCalled();
  });

  it('rejects reuse of a request key with a changed quantity or actor', async () => {
    const { service, movements } = fixture();
    movements.findOneBy.mockResolvedValue({ ...payload, quantity: '5.0000', remark: null, recordedBy: '7' });
    await expect(service.record('1', { ...payload, quantity: 6 }, '7')).rejects.toThrow(ConflictException);
    await expect(service.record('1', payload, '8')).rejects.toThrow(ConflictException);
    expect(movements.save).not.toHaveBeenCalled();
  });

  it('rejects new movements on inactive products', async () => {
    const { service, movements, productQuery } = fixture();
    productQuery.getOne.mockResolvedValue({ id: '1', isActive: false });
    await expect(service.record('1', payload, '7')).rejects.toThrow(BadRequestException);
    expect(movements.save).not.toHaveBeenCalled();
  });
});
