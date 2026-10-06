import {
  allocateBySource,
  allocateFifo,
  InsufficientQuantityError,
  validateManualAllocation,
} from './allocation';
import {
  allocateToBoxes,
  packageQrCode,
  parseTransferBoxCode,
  sliceOrigins,
  splitIntoBoxes,
  transferBoxCode,
  wipBoxes,
} from './packing';

describe('allocateBySource (MANUAL at produce)', () => {
  // WIP rows at a step in FIFO order; lot A arrived twice.
  const rows = [
    { id: 'w1', sourceId: 'A', remaining: 100 },
    { id: 'w2', sourceId: 'B', remaining: 50 },
    { id: 'w3', sourceId: 'A', remaining: 30 },
    { id: 'w0', sourceId: null, remaining: 999 },
  ];

  it('draws each picked lot FIFO across its own rows only', () => {
    expect(
      allocateBySource(
        rows,
        [
          { id: 'B', qty: 20 },
          { id: 'A', qty: 110 },
        ],
        130,
      ),
    ).toEqual({
      allocations: [
        { id: 'w2', qty: 20 },
        { id: 'w1', qty: 100 },
        { id: 'w3', qty: 10 },
      ],
    });
  });

  it('rejects more than a lot holds across its rows', () => {
    const result = allocateBySource(rows, [{ id: 'A', qty: 131 }], 131);
    expect('error' in result && result.error).toContain('130');
  });

  it('rejects a sum that differs from the quantity', () => {
    expect('error' in allocateBySource(rows, [{ id: 'B', qty: 10 }], 20)).toBe(
      true,
    );
  });

  it('ignores plan-release rows (no source lot) and unknown lots', () => {
    expect('error' in allocateBySource(rows, [{ id: 'X', qty: 1 }], 1)).toBe(
      true,
    );
  });
});

describe('packing', () => {
  it('scenario: FG 150 by 100 → BOX001 100 + BOX002 50', () => {
    expect(splitIntoBoxes(150, 100)).toEqual([100, 50]);
  });

  it('exact multiples have no partial box; small quantities are one box', () => {
    expect(splitIntoBoxes(300, 100)).toEqual([100, 100, 100]);
    expect(splitIntoBoxes(30, 100)).toEqual([30]);
  });

  it('rejects invalid input', () => {
    expect(() => splitIntoBoxes(0, 100)).toThrow();
    expect(() => splitIntoBoxes(10, 0)).toThrow();
    expect(() => splitIntoBoxes(10.5, 100)).toThrow();
  });

  it('formats the box QR code', () => {
    expect(packageQrCode('FG-691002-001', 1)).toBe('QR-FG-691002-001-BOX001');
    expect(packageQrCode('ST-691002-003', 12)).toBe('QR-ST-691002-003-BOX012');
  });
});

describe('validateManualAllocation', () => {
  const lots = [
    { id: 'PS1', remaining: 100 },
    { id: 'PS2', remaining: 200 },
  ];

  it('accepts a split that adds up exactly (scenario: 150 from PS2)', () => {
    expect(
      validateManualAllocation(lots, [{ id: 'PS2', qty: 150 }], 150),
    ).toBeNull();
    expect(
      validateManualAllocation(
        lots,
        [
          { id: 'PS1', qty: 50 },
          { id: 'PS2', qty: 100 },
        ],
        150,
      ),
    ).toBeNull();
  });

  it('rejects totals that do not match', () => {
    expect(
      validateManualAllocation(lots, [{ id: 'PS2', qty: 100 }], 150),
    ).toMatch(/ไม่เท่ากับ/);
  });

  it('rejects taking more than a lot holds', () => {
    expect(
      validateManualAllocation(lots, [{ id: 'PS1', qty: 120 }], 120),
    ).toMatch(/เกินยอดคงเหลือ/);
  });

  it('rejects unknown lots, duplicates, empty and non-positive lines', () => {
    expect(validateManualAllocation(lots, [{ id: 'X', qty: 1 }], 1)).toMatch(
      /ไม่อยู่ใน/,
    );
    expect(
      validateManualAllocation(
        lots,
        [
          { id: 'PS1', qty: 1 },
          { id: 'PS1', qty: 1 },
        ],
        2,
      ),
    ).toMatch(/ซ้ำ/);
    expect(validateManualAllocation(lots, [], 1)).toMatch(/อย่างน้อย/);
    expect(validateManualAllocation(lots, [{ id: 'PS1', qty: 0 }], 0)).toMatch(
      /มากกว่า 0/,
    );
  });
});
import { formatLotNo, lotPrefix } from './lot-number';
import {
  addDays,
  productionDayOf,
  validateProductionDay,
} from './production-day';

/** Bangkok wall clock → Date (UTC+7). */
const bkk = (iso: string) => new Date(`${iso}+07:00`);

describe('productionDayOf (A 08:00–16:59, B 17:00–07:59)', () => {
  it.each([
    ['2026-10-01T08:00:00', '2026-10-01', 'A'],
    ['2026-10-01T16:59:59', '2026-10-01', 'A'],
    ['2026-10-01T17:00:00', '2026-10-01', 'B'],
    ['2026-10-01T23:30:00', '2026-10-01', 'B'],
    ['2026-10-02T02:00:00', '2026-10-01', 'B'],
    ['2026-10-02T07:59:59', '2026-10-01', 'B'],
    ['2026-10-02T08:00:00', '2026-10-02', 'A'],
    ['2027-01-01T03:00:00', '2026-12-31', 'B'],
  ])('%s → %s shift %s', (at, date, shift) => {
    expect(productionDayOf(bkk(at))).toEqual({ productionDate: date, shift });
  });
});

describe('validateProductionDay', () => {
  const now = bkk('2026-10-02T10:00:00'); // 2 Oct shift A

  it('accepts the current shift and earlier shifts', () => {
    expect(
      validateProductionDay({ productionDate: '2026-10-02', shift: 'A' }, now),
    ).toBeNull();
    expect(
      validateProductionDay({ productionDate: '2026-10-01', shift: 'B' }, now),
    ).toBeNull();
    expect(
      validateProductionDay({ productionDate: '2026-09-30', shift: 'A' }, now),
    ).toBeNull();
  });

  it('rejects a future shift or day', () => {
    expect(
      validateProductionDay({ productionDate: '2026-10-02', shift: 'B' }, now),
    ).toMatch(/อนาคต/);
    expect(
      validateProductionDay({ productionDate: '2026-10-03', shift: 'A' }, now),
    ).toMatch(/อนาคต/);
  });

  it('rejects more than 2 days back', () => {
    expect(
      validateProductionDay({ productionDate: '2026-09-29', shift: 'B' }, now),
    ).toMatch(/ย้อนหลัง/);
  });

  it('treats 02:00 as the previous day shift B', () => {
    const night = bkk('2026-10-03T02:00:00');
    expect(
      validateProductionDay(
        { productionDate: '2026-10-02', shift: 'B' },
        night,
      ),
    ).toBeNull();
    expect(
      validateProductionDay(
        { productionDate: '2026-10-03', shift: 'A' },
        night,
      ),
    ).toMatch(/อนาคต/);
  });

  it('addDays crosses month/year boundaries', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('lot numbers', () => {
  it('uses the Buddhist-era year (scenario lots)', () => {
    expect(formatLotNo('WE', '2026-10-01', 1)).toBe('WE-691001-001');
    expect(formatLotNo('WE', '2026-10-02', 1)).toBe('WE-691002-001');
    expect(formatLotNo('PS', '2026-10-02', 12)).toBe('PS-691002-012');
  });

  it('prefix: process code, FG/ST for receiving steps', () => {
    expect(lotPrefix('we', 'NONE')).toBe('WE');
    expect(lotPrefix('INCOME-FG', 'FG')).toBe('FG');
    expect(lotPrefix('INCOME-STORE', 'STORE')).toBe('ST');
  });

  it('rejects invalid input', () => {
    expect(() => formatLotNo('WE', 'bad', 1)).toThrow();
    expect(() => formatLotNo('WE', '2026-10-01', 0)).toThrow();
  });
});

describe('allocateFifo', () => {
  const rows = [
    { id: 'P1', remaining: 250 },
    { id: 'P2', remaining: 150 },
  ];

  it('drains the oldest row first (scenario: PS produces 200 from 250 + 150)', () => {
    expect(allocateFifo(rows, 200)).toEqual([{ id: 'P1', qty: 200 }]);
  });

  it('spills into the next row', () => {
    expect(allocateFifo(rows, 300)).toEqual([
      { id: 'P1', qty: 250 },
      { id: 'P2', qty: 50 },
    ]);
  });

  it('skips empty rows', () => {
    expect(allocateFifo([{ id: 'X', remaining: 0 }, ...rows], 10)).toEqual([
      { id: 'P1', qty: 10 },
    ]);
  });

  it('never over-allocates', () => {
    expect(() => allocateFifo(rows, 401)).toThrow(InsufficientQuantityError);
  });

  it('rejects non-positive or fractional quantities', () => {
    expect(() => allocateFifo(rows, 0)).toThrow();
    expect(() => allocateFifo(rows, 1.5)).toThrow();
  });
});

describe('transfer boxes (wipBoxes)', () => {
  it('splits a batch into full boxes then a partial one, origins dealt oldest first', () => {
    const boxes = wipBoxes(
      250,
      100,
      [
        { key: 'A', qty: 150 },
        { key: 'B', qty: 100 },
      ],
      [],
    );
    expect(boxes.map((b) => b.qty)).toEqual([100, 100, 50]);
    expect(boxes[0].origins).toEqual([{ key: 'A', qty: 100 }]);
    expect(boxes[1].origins).toEqual([
      { key: 'A', qty: 50 },
      { key: 'B', qty: 50 },
    ]);
    expect(boxes[2].origins).toEqual([{ key: 'B', qty: 50 }]);
    expect(boxes.every((b) => b.status === 'WAITING')).toBe(true);
  });

  it('shows per-box progress and CLOSED for a closed-out batch', () => {
    const boxes = wipBoxes(250, 100, [{ key: 'A', qty: 250 }], [100, 30, 0]);
    expect(boxes.map((b) => [b.doneQty, b.status])).toEqual([
      [100, 'DONE'],
      [30, 'PARTIAL'],
      [0, 'WAITING'],
    ]);
    const closed = wipBoxes(250, 100, [{ key: 'A', qty: 250 }], [100], true);
    expect(closed.map((b) => b.status)).toEqual(['DONE', 'CLOSED', 'CLOSED']);
  });

  it('draws from chosen boxes in order; null when they cannot cover it', () => {
    const sizes = [100, 100, 50];
    expect(allocateToBoxes(sizes, [0, 0, 0], 120, [3, 1])).toEqual([
      { boxNo: 3, qty: 50 },
      { boxNo: 1, qty: 70 },
    ]);
    expect(allocateToBoxes(sizes, [100, 20, 0], 80)).toEqual([
      { boxNo: 2, qty: 80 },
    ]);
    expect(allocateToBoxes(sizes, [0, 0, 0], 60, [3])).toBeNull();
  });

  it('slices a box origin list by position', () => {
    const o = [
      { key: 'A', qty: 50 },
      { key: 'B', qty: 50 },
    ];
    expect(sliceOrigins(o, 30, 40)).toEqual([
      { key: 'A', qty: 20 },
      { key: 'B', qty: 20 },
    ]);
    expect(sliceOrigins(o, 0, 100)).toEqual(o);
  });

  it('is one box without a pack size, and codes round-trip', () => {
    expect(wipBoxes(70, null, [{ key: 'A', qty: 70 }], [])).toHaveLength(1);
    const code = transferBoxCode('TQ-WE-691004-010-S2-01', 3);
    expect(code).toBe('TQ-WE-691004-010-S2-01-B003');
    expect(parseTransferBoxCode(code)).toEqual({
      batchQr: 'TQ-WE-691004-010-S2-01',
      boxNo: 3,
    });
    expect(parseTransferBoxCode('TQ-WE-691004-010-S2-01')).toBeNull();
  });
});
