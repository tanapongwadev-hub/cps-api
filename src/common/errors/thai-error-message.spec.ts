import { HttpStatus } from '@nestjs/common';
import {
  thaiErrorFallback,
  toThaiErrorMessage,
  toThaiValidationMessage,
} from './thai-error-message';

describe('Thai error messages', () => {
  it('preserves an existing Thai message', () => {
    expect(toThaiErrorMessage('กรุณาระบุเหตุผล')).toBe('กรุณาระบุเหตุผล');
  });

  it('translates authentication and resource errors', () => {
    expect(toThaiErrorMessage('Invalid username or password', 401)).toBe(
      'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    );
    expect(toThaiErrorMessage('Material receiving not found', 404)).toBe(
      'ไม่พบรายการรับเข้า',
    );
    expect(toThaiErrorMessage('Material 42 not found', 404)).toBe(
      'ไม่พบวัตถุดิบ 42',
    );
    expect(toThaiErrorMessage('Supplier 8 is inactive', 400)).toBe(
      'ผู้จำหน่าย 8 ถูกระงับการใช้งาน',
    );
  });

  it('keeps useful stock quantities in Thai', () => {
    expect(
      toThaiErrorMessage(
        'Insufficient stock for material 7. Requested: 10, Available: 4',
      ),
    ).toBe('สต็อกวัตถุดิบ 7 ไม่เพียงพอ (ต้องการ 10, คงเหลือที่ใช้ได้ 4)');
  });

  it('never exposes an unknown English exception to users', () => {
    expect(toThaiErrorMessage('driver exploded unexpectedly', 500)).toBe(
      thaiErrorFallback(HttpStatus.INTERNAL_SERVER_ERROR),
    );
  });

  it('translates class-validator constraints with the field path', () => {
    expect(
      toThaiValidationMessage(
        'lines.0.quantity',
        'isInt',
        'quantity must be an integer number',
      ),
    ).toBe('lines.0.quantity ต้องเป็นจำนวนเต็ม');
    expect(
      toThaiValidationMessage(
        'unexpected',
        'whitelistValidation',
        'property unexpected should not exist',
      ),
    ).toBe('ไม่อนุญาตให้ส่งฟิลด์ unexpected');
  });
});
