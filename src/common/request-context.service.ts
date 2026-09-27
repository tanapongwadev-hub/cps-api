import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  correlationId: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Request-local metadata shared by guards, services, audit producers, and
 * operational logging. It deliberately contains identifiers and transport
 * metadata only — never request/response bodies or credentials.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }
}
