import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { RoleCode } from '../enums/role-code.enum';
import { PermissionDeniedException } from '../exceptions/custom-exceptions';
import { CurrentUserWithAssignment } from '../interfaces/current-user.interface';
import { EffectivePermissionService } from '../../modules/access-control/services/effective-permission.service';

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

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as CurrentUserWithAssignment;

    if (!user) {
      throw new PermissionDeniedException(request.path);
    }

    // SUPER_ADMIN bypasses permission checks
    if (user.activeRoleCode === RoleCode.SUPER_ADMIN) {
      return true;
    }

    const permissions =
      await this.effectivePermissionService.getEffectivePermissionCodes(
        user.id,
        undefined,
        (user.activeRoleCode as string) === RoleCode.SUPER_ADMIN,
      );
    const granted = new Set(permissions);
    if (requiredPermissions.every((permission) => granted.has(permission))) {
      return true;
    }

    throw new PermissionDeniedException(request.path);
  }
}
