import { BadRequestException } from '@nestjs/common';
import {
  allocateFromBoxes,
  parseDeliveryStatement,
} from './sales-order-import';

const title = 'ใบแจ้งยอดส่งสินค้า TH : 2026-10-08';
const honda = [
  [null, null, null, title, title, null, null, null, null, 'ISSUED', 'CHECK'],
  [],
  [],
  [
    'No.',
    'TIME',
    'Home',
    'PartNo',
    'PartName',
    'LINE',
    'Qty',
    'PO NO',
    'PRODUCT',
    'LOT No.',
  ],
  [
    1,
    8,
    '07331',
    '17510-K3G-M000-XB',
    'TANK',
    'L2KD01',
    720,
    '073723',
    'CCIS',
    '26J0801',
  ],
  [
    2,
    9,
    '07347',
    '16500-ZF5-8212',
    'CONTROL',
    'L3ME07',
    36,
    100010,
    'CCIS',
    '26J0801',
  ],
  [null, null, null, null, null, null, null, null, null, null],
];

describe('parseDeliveryStatement', () => {
  it('reads the HONDA layout with PO, Home, LINE and TIME per line', () => {
    const result = parseDeliveryStatement(honda);
    expect(result.orderDate).toBe('2026-10-08');
    expect(result.lot).toBe('26J0801');
    expect(result.lines).toEqual([
      {
        row: 5,
        partNo: '17510-K3G-M000-XB',
        quantity: 720,
        customerPo: '073723',
        deliveryTime: '8',
        deliveryPoint: '07331',
        customerLine: 'L2KD01',
      },
      {
        row: 6,
        partNo: '16500-ZF5-8212',
        quantity: 36,
        customerPo: '100010',
        deliveryTime: '9',
        deliveryPoint: '07347',
        customerLine: 'L3ME07',
      },
    ]);
  });

  it('reads the CNN layout without PO or Home', () => {
    const result = parseDeliveryStatement([
      [null, null, null, 'ใบแจ้งยอดส่งสินค้า (งานในเครือ) CNN TH : 2026-10-08'],
      [
        'No.',
        'TIME',
        'Packing',
        'PartNo',
        'PartName',
        'LINE',
        'Qty',
        'Box',
        'PRODUCT',
        'LOT No.',
      ],
      [
        1,
        '08',
        150,
        '12310-Z4M-0100-21',
        'SEPARATER',
        'CCIS',
        1800,
        12,
        'CNN',
        '26J0801',
      ],
    ]);
    expect(result.lines).toEqual([
      {
        row: 3,
        partNo: '12310-Z4M-0100-21',
        quantity: 1800,
        customerPo: null,
        deliveryTime: '08',
        deliveryPoint: null,
        customerLine: 'CCIS',
      },
    ]);
  });

  it('rejects a file without a PartNo/Qty header', () => {
    expect(() =>
      parseDeliveryStatement([
        ['a', 'b'],
        [1, 2],
      ]),
    ).toThrow(BadRequestException);
  });

  it('names the Excel row when Qty is not a positive integer', () => {
    const rows = honda
      .slice(0, 5)
      .concat([[3, 8, '07331', 'X-1', 'N', 'L', 1.5, 'P', 'C', 'L']]);
    expect(() => parseDeliveryStatement(rows)).toThrow(/แถว 6/);
  });

  it('rejects a file with no order lines', () => {
    expect(() => parseDeliveryStatement(honda.slice(0, 4))).toThrow(
      BadRequestException,
    );
  });
});

describe('allocateFromBoxes', () => {
  it('does not reuse quantity already planned for an earlier line', () => {
    const boxes = [
      { id: '1', currentQty: 100 },
      { id: '2', currentQty: 100 },
    ];
    const planned = new Map<string, number>();
    const first = allocateFromBoxes(boxes, new Map(), planned, 150);
    expect(first.takes).toEqual([
      { packageId: '1', qty: 100 },
      { packageId: '2', qty: 50 },
    ]);
    const second = allocateFromBoxes(boxes, new Map(), planned, 80);
    expect(second.takes).toEqual([{ packageId: '2', qty: 50 }]);
    expect(second.shortfall).toBe(30);
    expect(second.available).toBe(50);
  });

  it('subtracts reservations held by other orders', () => {
    const result = allocateFromBoxes(
      [{ id: '1', currentQty: 100 }],
      new Map([['1', 70]]),
      new Map(),
      40,
    );
    expect(result.takes).toEqual([{ packageId: '1', qty: 30 }]);
    expect(result.shortfall).toBe(10);
  });
});
