import { Injectable } from '@nestjs/common';
import { AccessControlService } from '../access-control.service';

@Injectable()
export class EffectivePermissionService {
  constructor(private readonly accessControlService: AccessControlService) {}

  async getEffectivePermissionCodes(
    userId: string,
    assignmentId?: string,
    isSuperAdmin = false,
  ): Promise<string[]> {
    if (isSuperAdmin) {
      return this.sortedUnique(
        await this.accessControlService.getAllActivePermissionCodes(),
      );
    }

    const rows = await this.accessControlService.getEffectivePermissionRows(
      userId,
      assignmentId,
    );
    const rowsByAssignment = new Map<string, typeof rows>();
    for (const row of rows) {
      const assignmentRows = rowsByAssignment.get(row.assignmentId) ?? [];
      assignmentRows.push(row);
      rowsByAssignment.set(row.assignmentId, assignmentRows);
    }

    const allowed: string[] = [];
    for (const assignmentRows of rowsByAssignment.values()) {
      const denied = new Set(
        assignmentRows
          .filter((row) => row.effect === 'DENY')
          .map((row) => row.code),
      );
      allowed.push(
        ...assignmentRows
          .filter(
            (row) => row.effect === 'ALLOW' && !denied.has(row.code),
          )
          .map((row) => row.code),
      );
    }

    return this.sortedUnique(allowed);
  }

  private sortedUnique(values: string[]): string[] {
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }
}
