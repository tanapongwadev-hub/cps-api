import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { toThaiValidationMessage } from '../errors/thai-error-message';

export class CustomValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors: ValidationError[]) => {
        const messages = flattenValidationErrors(errors);
        return new BadRequestException({
          statusCode: 400,
          error: 'คำขอไม่ถูกต้อง',
          code: 'VALIDATION_ERROR',
          message: messages,
        });
      },
    });
  }
}

function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): string[] {
  return errors.flatMap((error) => {
    const property = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(
      ([constraint, message]) =>
        toThaiValidationMessage(property, constraint, message),
    );
    return [...own, ...flattenValidationErrors(error.children ?? [], property)];
  });
}
