import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;
    const body = this.sanitizeBody(request.body);
    const ip = request.ip || request.connection?.remoteAddress;
    const userAgent = request.get('user-agent') || 'unknown';

    const now = Date.now();

    this.logger.log(
      `→ ${method} ${url} | IP: ${ip} | User-Agent: ${userAgent}`,
    );
    if (Object.keys(body).length > 0) {
      this.logger.log(`  Body: ${JSON.stringify(body)}`);
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode;
          const responseTime = Date.now() - now;
          this.logger.log(
            `← ${method} ${url} ${statusCode} - ${responseTime}ms | Response: ${JSON.stringify(this.truncateResponse(data))}`,
          );
        },
        error: (error) => {
          const responseTime = Date.now() - now;
          this.logger.error(
            `← ${method} ${url} ${error.status || 500} - ${responseTime}ms | Error: ${error.message}`,
            error.stack,
          );
        },
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') return {};
    const sanitized = { ...body };
    const sensitiveFields = [
      'password',
      'newPassword',
      'refreshToken',
      'token',
    ];
    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '***';
      }
    });
    return sanitized;
  }

  private truncateResponse(data: any): any {
    if (!data) return data;
    // Auth responses contain nested tokens. Redact before truncating so no
    // prefix of an access/refresh/selection token reaches application logs.
    const sensitive = new Set([
      'accessToken',
      'refreshToken',
      'departmentSelectionToken',
      'password',
      'token',
    ]);
    const stringified = JSON.stringify(data, (key, value) =>
      sensitive.has(key) ? '***' : value,
    );
    if (stringified.length > 500) {
      return stringified.substring(0, 500) + '... (truncated)';
    }
    return JSON.parse(stringified);
  }
}
