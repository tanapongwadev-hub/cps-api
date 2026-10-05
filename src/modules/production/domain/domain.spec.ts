import { allocateFifo, InsufficientQuantityError } from './allocation';
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
