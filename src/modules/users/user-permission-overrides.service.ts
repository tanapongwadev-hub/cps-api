import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Permission } from '../../entities/iam/permission.entity';
import { Role } from '../../entities/iam/role.entity';
import { UserDepartmentPermission } from '../../entities/iam/user-department-permission.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { RoleCode } from '../../common/enums/role-code.enum';
import { createTraceId, recordAuditEvent } from '../../common/stock-ledger';
import { ReplacePermissionOverridesDto } from './dto/replace-permission-overrides.dto';

export interface PermissionOverrideInput {
  permissionId: string;
  effect: 'ALLOW' | 'DENY';
  expiresAt: Date | null;
}

interface OverrideSnapshot {
  permissionCode: string;
  effect: 'ALLOW' | 'DENY';
  expiresAt: string | null;
}

function snapshot(
  rows: Array<{ permission?: Permission | null; permissionCode?: string; effect: 'ALLOW' | 'DENY'; expiresAt: Date | null }>,
): OverrideSnapshot[] {
  return rows
    .map((row) => ({
      permissionCode: row.permissionCode ?? row.permission?.code ?? '',
      effect: row.effect ?? 'ALLOW',
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    }))
    .sort((a, b) => a.permissionCode.localeCompare(b.permissionCode));
}

/**
 * Replaces every override of one assignment inside the caller's transaction
 * and writes `iam.user_permission.overrides_changed` when the set changed.
 * Does not bump `users.permission_version`: effective permissions are
 * computed per request, and bumping would revoke the user's session.
 */
export async function replaceAssignmentOverrides(
  manager: EntityManager,
  assignment: UserDepartmentRole,
  items: PermissionOverrideInput[],
  actorId: string | null,
  reason: string | null,
): Promise<boolean> {
  const ids = items.map((item) => item.permissionId);
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException('มีสิทธิ์ซ้ำในรายการ override');
  }
  const permissions = ids.length
    ? await manager
        .getRepository(Permission)
        .find({ where: { id: In(ids), isActive: true } })
    : [];
  const byId = new Map(permissions.map((permission) => [permission.id, permission]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new BadRequestException({
      message: 'ไม่พบสิทธิ์ที่ระบุหรือสิทธิ์ถูกปิดใช้งาน',
      permissionIds: missing,
    });
  }
  const now = Date.now();
  if (items.some((item) => item.expiresAt && item.expiresAt.getTime() <= now)) {
    throw new BadRequestException('วันหมดอายุของ override ต้องเป็นเวลาในอนาคต');
  }

  const repository = manager.getRepository(UserDepartmentPermission);
  const existing = await repository.find({
    where: { userDepartmentRoleId: assignment.id, isActive: true },
    relations: ['permission'],
  });
  const before = snapshot(existing);
  const after = snapshot(
    items.map((item) => ({
      permissionCode: byId.get(item.permissionId)!.code,
      effect: item.effect,
      expiresAt: item.expiresAt,
    })),
  );
  if (JSON.stringify(before) === JSON.stringify(after)) return false;

  await repository.delete({ userDepartmentRoleId: assignment.id });
  for (const item of items) {
    await repository.save(
      repository.create({
        userDepartmentRoleId: assignment.id,
        permissionId: item.permissionId,
        effect: item.effect,
        expiresAt: item.expiresAt ?? undefined,
        isActive: true,
        grantedAt: new Date(),
        ...(actorId ? { grantedBy: actorId, createdBy: actorId } : {}),
      }),
    );
  }

  await recordAuditEvent(manager, {
    traceId: createTraceId(),
    action: 'UPDATE',
    eventName: 'iam.user_permission.overrides_changed',
    targetType: 'USER_ASSIGNMENT',
    targetId: assignment.id,
    performedBy: actorId,
    departmentId: assignment.departmentId,
    reason,
    before: { userId: assignment.userId, overrides: before },
    after: { userId: assignment.userId, overrides: after },
  });
  return true;
}

@Injectable()
export class UserPermissionOverridesService {
  constructor(private readonly dataSource: DataSource) {}

  async list(userId: string, assignmentId: string) {
    const assignment = await this.findAssignment(
      this.dataSource.manager,
      userId,
      assignmentId,
    );
    const rows = await this.dataSource.manager
      .getRepository(UserDepartmentPermission)
      .find({
        where: { userDepartmentRoleId: assignment.id, isActive: true },
        relations: ['permission'],
        order: { id: 'ASC' },
      });
    return {
      assignmentId: assignment.id,
      departmentId: assignment.departmentId,
      roleId: assignment.roleId,
      items: rows.map((row) => ({
        permissionId: row.permissionId,
        permissionCode: row.permission?.code ?? null,
        effect: row.effect ?? 'ALLOW',
        expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
        expired: Boolean(row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()),
      })),
    };
  }

  async replace(
    userId: string,
    assignmentId: string,
    dto: ReplacePermissionOverridesDto,
    actorId: string | null,
  ) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('กรุณาระบุเหตุผลในการเปลี่ยนสิทธิ์');
    }
    let changed = false;
    await this.dataSource.transaction(async (manager) => {
      const assignment = await this.findAssignment(
        manager,
        userId,
        assignmentId,
        true,
      );
      const role = await manager
        .getRepository(Role)
        .findOne({ where: { id: assignment.roleId } });
      if (role?.code === RoleCode.SUPER_ADMIN) {
        throw new BadRequestException(
          'SUPER_ADMIN ข้ามการตรวจสิทธิ์ทั้งหมด จึงไม่ต้องกำหนด override',
        );
      }
      changed = await replaceAssignmentOverrides(
        manager,
        assignment,
        dto.items.map((item) => ({
          permissionId: item.permissionId,
          effect: item.effect,
          expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
        })),
        actorId,
        reason,
      );
    });
    return { changed, ...(await this.list(userId, assignmentId)) };
  }

  private async findAssignment(
    manager: EntityManager,
    userId: string,
    assignmentId: string,
    lock = false,
  ) {
    const assignment = await manager.getRepository(UserDepartmentRole).findOne({
      where: { id: assignmentId, userId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!assignment) {
      throw new NotFoundException('User assignment not found');
    }
    return assignment;
  }
}
