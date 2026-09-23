import { ArgumentsHost, ConflictException } from '@nestjs/common';
import { ThaiExceptionFilter } from './thai-exception.filter';

describe('ThaiExceptionFilter', () => {
  it('translates the message and preserves structured domain details', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/v1/production-plans/1/approve' }),
      }),
    } as unknown as ArgumentsHost;

    new ThaiExceptionFilter().catch(
      new ConflictException({
        code: 'INSUFFICIENT_STOCK',
        message: 'Insufficient stock to approve the Production Plan',
        shortfalls: [{ materialCode: 'MAT-001', shortage: '2' }],
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INSUFFICIENT_STOCK',
        error: 'ข้อมูลขัดแย้ง',
        message: 'สต็อกไม่เพียงพอสำหรับอนุมัติแผนการผลิต',
        path: '/api/v1/production-plans/1/approve',
        shortfalls: [{ materialCode: 'MAT-001', shortage: '2' }],
      }),
    );
  });

  it('returns a safe Thai message for an unexpected exception', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/v1/test' }),
      }),
    } as unknown as ArgumentsHost;

    new ThaiExceptionFilter().catch(
      new Error('database password leaked'),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'ข้อผิดพลาดภายในระบบ',
        message: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง',
      }),
    );
  });
});
