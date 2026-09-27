import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RequestContextService } from '../request-context.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly requestContext: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    // Operational logging is allowlisted metadata only. Request/response
    // bodies, query strings, and token-bearing headers are not an audit sink.
    const path = request.path;
    const activity = this.requestContext.get();
    const now = Date.now();

    this.logger.log(
      JSON.stringify({
        eventName: 'http.request.started',
        method,
        path,
        correlationId: activity?.correlationId,
        requestId: activity?.requestId,
      }),
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode;
          const responseTime = Date.now() - now;
          this.logger.log(
            JSON.stringify({
              eventName: 'http.request.completed',
              method,
              path: request.route?.path ?? path,
              statusCode,
              durationMs: responseTime,
              correlationId: activity?.correlationId,
              requestId: activity?.requestId,
            }),
          );
        },
        error: (error: unknown) => {
          const responseTime = Date.now() - now;
          const failure = this.failureMetadata(error);
          this.logger.error(
            JSON.stringify({
              eventName: 'http.request.failed',
              method,
              path,
              statusCode: failure.statusCode,
              errorCode: failure.code,
              errorType: failure.type,
              durationMs: responseTime,
              correlationId: activity?.correlationId,
              requestId: activity?.requestId,
            }),
            failure.stack,
          );
        },
      }),
    );
  }

  private failureMetadata(error: unknown): {
    statusCode: number;
    code: string | null;
    type: string;
    stack: string | undefined;
  } {
    if (!(error instanceof Error)) {
      return { statusCode: 500, code: null, type: 'UnknownError', stack: undefined };
    }
    const candidate = error as Error & { status?: unknown; response?: unknown };
    const response = candidate.response;
    const code =
      typeof response === 'object' && response !== null && 'code' in response &&
      typeof response.code === 'string'
        ? response.code
        : null;
    return {
      statusCode: typeof candidate.status === 'number' ? candidate.status : 500,
      code,
      type: error.constructor.name,
      stack: error.stack,
    };
  }
}
