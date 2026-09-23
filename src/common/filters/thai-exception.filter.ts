import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  thaiStatusLabel,
  toThaiErrorMessage,
} from '../errors/thai-error-message';

interface ErrorBody extends Record<string, unknown> {
  message?: unknown;
  error?: unknown;
}

@Catch()
export class ThaiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const request = http.getRequest<{ url?: string }>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const source = this.responseBody(exception);
    const messages = Array.isArray(source.message)
      ? source.message.map((item) => toThaiErrorMessage(item, statusCode))
      : toThaiErrorMessage(source.message, statusCode);

    response.status(statusCode).json({
      ...source,
      statusCode,
      error: thaiStatusLabel(statusCode),
      message: messages,
      path: source.path ?? request.url,
      timestamp: source.timestamp ?? new Date().toISOString(),
    });
  }

  private responseBody(exception: unknown): ErrorBody {
    if (!(exception instanceof HttpException)) return {};
    const body = exception.getResponse();
    return typeof body === 'string'
      ? { message: body }
      : { ...(body as ErrorBody) };
  }
}
