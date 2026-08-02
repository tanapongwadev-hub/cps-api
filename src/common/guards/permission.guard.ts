import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_ANY_PERMISSIONS_KEY } from '../decorators/require-any-permissions.decorator';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { RoleCode } from '../enums/role-code.enum';
import { PermissionDeniedException } from '../exceptions/custom-exceptions';
import { CurrentUserWithAssignment } from '../interfaces/current-user.interface';
import { EffectivePermissionService } from '../../modules/access-control/services/effective-permission.service';

interface PermissionRequest {
  user?: CurrentUserWithAssignment;
  path?: string;
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private effectivePermissionService: EffectivePermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const anyPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiresAll = Boolean(requiredPermissions?.length);
    const requiresAny = Boolean(anyPermissions?.length);
    if (!requiresAll && !requiresAny) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PermissionRequest>();
    const user = request.user;

    if (!user) {
      throw new PermissionDeniedException(request.path);
    }

    // SUPER_ADMIN bypasses permission checks
    const isSuperAdmin = user.activeRoleCode === RoleCode.SUPER_ADMIN;
    if (isSuperAdmin) {
      return true;
    }

    const permissions =
      await this.effectivePermissionService.getEffectivePermissionCodes(
        user.id,
        undefined,
        isSuperAdmin,
      );
    const granted = new Set(permissions);
    const hasAll =
      !requiresAll ||
      requiredPermissions?.every((permission) => granted.has(permission)) ===
        true;
    const hasAny =
      !requiresAny ||
      anyPermissions?.some((permission) => granted.has(permission)) === true;
    if (hasAll && hasAny) {
      return true;
    }

    throw new PermissionDeniedException(request.path);
  }
}
