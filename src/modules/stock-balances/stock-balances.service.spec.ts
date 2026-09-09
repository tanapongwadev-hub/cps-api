import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListMaterialInventoryQueryDto } from './dto/list-material-inventory-query.dto';
import { classifyMaterialStock } from './stock-balances.service';

describe('material inventory stock contract', () => {
  it.each([
    [0, 0, 'OUT_OF_STOCK'],
    [-1, 10, 'OUT_OF_STOCK'],
    [1, 10, 'LOW_STOCK'],
    [9.9999, 10, 'LOW_STOCK'],
    [10, 10, 'NORMAL'],
    [20, 10, 'NORMAL'],
  ])(
    'classifies current %s / minimum %s as %s',
    (current, minimum, expected) => {
      expect(classifyMaterialStock(current, minimum)).toBe(expected);
    },
  );

  it('normalizes supported inventory filters and paging', async () => {
    const dto = plainToInstance(ListMaterialInventoryQueryDto, {
      page: '2',
      limit: '40',
      search: ' bolt ',
      isActive: 'false',
      type: ' PC ',
      supplierId: ' 7 ',
      modelId: '8',
      loadingPointId: '9',
      processLineName: ' Line 1 ',
      stockStatus: ' LOW_STOCK ',
      sortBy: 'currentStock',
      sortOrder: 'desc',
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      page: 2,
      limit: 40,
      search: 'bolt',
      isActive: false,
      type: 'PC',
      supplierId: '7',
      modelId: '8',
      loadingPointId: '9',
      processLineName: 'Line 1',
      stockStatus: 'LOW_STOCK',
      sortBy: 'currentStock',
      sortOrder: 'desc',
    });
  });

  it('rejects invalid stock filters and unsupported page sizes', async () => {
    const dto = plainToInstance(ListMaterialInventoryQueryDto, {
      page: '0',
      limit: '101',
      isActive: 'yes',
      supplierId: '-1',
      stockStatus: 'EMPTY',
      sortBy: 'quantity',
      sortOrder: 'sideways',
    });

    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'page',
        'limit',
        'isActive',
        'supplierId',
        'stockStatus',
        'sortBy',
        'sortOrder',
      ]),
    );
  });
});
