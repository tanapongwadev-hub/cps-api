import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(
    err: unknown,
    user: TUser,
    info: { name?: string },
  ): TUser {
    if (err) throw err;
    if (!user) {
      const code =
        info?.name === 'TokenExpiredError'
          ? 'ACCESS_TOKEN_EXPIRED'
          : 'ACCESS_TOKEN_INVALID';
      throw new UnauthorizedException({
        code,
        message: 'Access token rejected',
      });
    }
    return user;
  }

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
