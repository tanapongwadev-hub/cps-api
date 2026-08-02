import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleCode } from '../../common/enums/role-code.enum';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { User } from '../../entities/iam/user.entity';
import { AccessControlService } from '../access-control/access-control.service';
import { EffectivePermissionService } from '../access-control/services/effective-permission.service';
import {
  MenuResponse,
  MenuTreeService,
} from '../access-control/services/menu-tree.service';
import { UserAccessSummaryDto } from './dto/user-access-summary.dto';

@Injectable()
export class UserAccessSummaryService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(UserDepartmentRole)
    private readonly assignments: Repository<UserDepartmentRole>,
    private readonly effectivePermissions: EffectivePermissionService,
    private readonly accessControl: AccessControlService,
    private readonly menuTree: MenuTreeService,
  ) {}

  async getForUser(userId: string): Promise<UserAccessSummaryDto> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const assignments = await this.assignments
      .createQueryBuilder('udr')
      .leftJoinAndSelect('udr.department', 'department')
      .leftJoinAndSelect('udr.role', 'role')
      .where('udr.userId = :userId', { userId })
      .orderBy('udr.createdAt', 'ASC')
      .addOrderBy('udr.id', 'ASC')
      .getMany();
    const menus = await this.accessControl.getMenusWithPermissions();
    const now = new Date();

    return {
      userId,
      assignments: await Promise.all(
        assignments.map(async (assignment) => {
          const available =
            assignment.isActive &&
            (!assignment.expiredAt || assignment.expiredAt > now);
          const isSuperAdmin = assignment.role.code === RoleCode.SUPER_ADMIN;
          const permissions = available
            ? await this.effectivePermissions.getEffectivePermissionCodes(
                userId,
                assignment.id,
                isSuperAdmin,
              )
            : [];
          const tree = available
            ? this.menuTree.buildMenuTree(menus, permissions, isSuperAdmin)
            : [];

          return {
            assignmentId: assignment.id,
            department: assignment.department
              ? {
                  id: assignment.department.id,
                  code: assignment.department.code,
                  name: assignment.department.nameTh,
                }
              : null,
            role: {
              id: assignment.role.id,
              code: assignment.role.code,
              name: assignment.role.nameTh,
              scopeType: assignment.role.scopeType,
            },
            isActive: assignment.isActive,
            expiredAt: assignment.expiredAt,
            permissions,
            menus: tree,
            menuCount: this.countMenus(tree),
          };
        }),
      ),
    };
  }

  private countMenus(items: MenuResponse[]): number {
    return items.reduce(
      (total, item) => total + 1 + this.countMenus(item.children),
      0,
    );
  }
}
