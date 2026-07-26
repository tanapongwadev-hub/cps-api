import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User } from '../../entities/iam/user.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { UserDepartmentPermission } from '../../entities/iam/user-department-permission.entity';
import { Permission } from '../../entities/iam/permission.entity';
import { CreateUserDto, CreateAssignmentDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { DuplicateResourceException } from '../../common/exceptions/custom-exceptions';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserDepartmentRole)
    private userDepartmentRoleRepository: Repository<UserDepartmentRole>,
    @InjectRepository(UserDepartmentPermission)
    private userDepartmentPermissionRepository: Repository<UserDepartmentPermission>,
  ) {}

  async findAll(page: number = 1, limit: number = 20, search?: string) {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.username',
        'user.email',
        'user.firstName',
        'user.lastName',
        'user.isActive',
        'user.isLocked',
        'user.createdAt',
      ]);

    if (search) {
      queryBuilder.andWhere(
        '(user.username ILIKE :search OR user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [items, totalItems] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('user.createdAt', 'DESC')
      .getManyAndCount();

    return {
      items,
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: [
        'id',
        'username',
        'email',
        'firstName',
        'lastName',
        'telephone',
        'isActive',
        'isLocked',
        'failedLoginAttempts',
        'lockedUntil',
        'lastLoginAt',
        'permissionVersion',
        'createdAt',
        'updatedAt',
      ],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async create(createUserDto: CreateUserDto) {
    const { username, password, assignments, ...userData } = createUserDto;

    // Check if username already exists
    const existingUser = await this.userRepository.findOne({
      where: { username: username.toLowerCase() },
    });

    if (existingUser) {
      throw new DuplicateResourceException('Username');
    }

    // Check if email already exists
    if (userData.email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email: userData.email.toLowerCase() },
      });

      if (existingEmail) {
        throw new DuplicateResourceException('Email');
      }
    }

    // Hash password
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // Create user with transaction
    const user = this.userRepository.create({
      username: username.toLowerCase(),
      passwordHash,
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email?.toLowerCase(),
      telephone: userData.telephone,
      isActive: true,
      isLocked: false,
      failedLoginAttempts: 0,
      permissionVersion: 1,
    });

    const savedUser = await this.userRepository.save(user);

    // Create assignments
    for (const assignment of assignments) {
      const userDepartmentRole = this.userDepartmentRoleRepository.create({
        userId: savedUser.id,
        departmentId: assignment.departmentId,
        roleId: assignment.roleId,
        isActive: true,
        assignedAt: new Date(),
      });

      const savedAssignment =
        await this.userDepartmentRoleRepository.save(userDepartmentRole);

      // Create permissions if provided
      if (assignment.permissionIds && assignment.permissionIds.length > 0) {
        for (const permissionId of assignment.permissionIds) {
          const userDepartmentPermission =
            this.userDepartmentPermissionRepository.create({
              userDepartmentRoleId: savedAssignment.id,
              permissionId,
              isActive: true,
              grantedAt: new Date(),
            });

          await this.userDepartmentPermissionRepository.save(
            userDepartmentPermission,
          );
        }
      }
    }

    return this.findOne(savedUser.id);
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.findOne(id);

    if (updateUserDto.email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email: updateUserDto.email.toLowerCase() },
      });

      if (existingEmail && existingEmail.id !== id) {
        throw new DuplicateResourceException('Email');
      }
    }

    Object.assign(user, updateUserDto);
    if (updateUserDto.email) {
      user.email = updateUserDto.email.toLowerCase();
    }

    await this.userRepository.save(user);

    return this.findOne(id);
  }

  async updateStatus(id: string, updateStatusDto: UpdateStatusDto) {
    const user = await this.findOne(id);

    // Prevent disabling the last super admin
    if (!updateStatusDto.isActive) {
      const superAdminAssignments = await this.userDepartmentRoleRepository
        .createQueryBuilder('udr')
        .leftJoin('udr.role', 'role')
        .where('role.code = :code', { code: 'SUPER_ADMIN' })
        .andWhere('udr.isActive = :isActive', { isActive: true })
        .getCount();

      if (superAdminAssignments <= 1) {
        // Check if this user is a super admin
        const isSuperAdmin = await this.userDepartmentRoleRepository
          .createQueryBuilder('udr')
          .leftJoin('udr.role', 'role')
          .where('udr.userId = :userId', { userId: id })
          .andWhere('role.code = :code', { code: 'SUPER_ADMIN' })
          .andWhere('udr.isActive = :isActive', { isActive: true })
          .getOne();

        if (isSuperAdmin) {
          throw new BadRequestException('Cannot disable the last super admin');
        }
      }
    }

    user.isActive = updateStatusDto.isActive;
    await this.userRepository.save(user);

    return this.findOne(id);
  }

  async resetPassword(id: string, newPassword: string) {
    const user = await this.findOne(id);

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    user.passwordHash = passwordHash;
    user.permissionVersion += 1;
    await this.userRepository.save(user);

    return { message: 'Password reset successfully' };
  }

  async getAssignments(userId: string) {
    const assignments = await this.userDepartmentRoleRepository
      .createQueryBuilder('udr')
      .leftJoinAndSelect('udr.department', 'department')
      .leftJoinAndSelect('udr.role', 'role')
      .where('udr.userId = :userId', { userId })
      .orderBy('udr.createdAt', 'DESC')
      .getMany();

    if (assignments.length === 0) {
      return [];
    }

    const assignmentIds = assignments.map((assignment) => assignment.id);
    const assignmentPermissions = await this.userDepartmentPermissionRepository
      .createQueryBuilder('udp')
      .leftJoinAndSelect('udp.permission', 'permission')
      .where('udp.userDepartmentRoleId IN (:...assignmentIds)', {
        assignmentIds,
      })
      .andWhere('udp.isActive = :isActive', { isActive: true })
      .getMany();
    const permissionsByAssignment = new Map<string, Permission[]>();

    for (const assignmentPermission of assignmentPermissions) {
      if (!assignmentPermission.permission) {
        continue;
      }

      const permissions = permissionsByAssignment.get(
        assignmentPermission.userDepartmentRoleId,
      ) ?? [];
      permissions.push(assignmentPermission.permission);
      permissionsByAssignment.set(
        assignmentPermission.userDepartmentRoleId,
        permissions,
      );
    }

    return assignments.map((assignment) => ({
      ...assignment,
      permissions: permissionsByAssignment.get(assignment.id) ?? [],
    }));
  }

  async createAssignment(userId: string, assignmentDto: CreateAssignmentDto) {
    const user = await this.findOne(userId);

    // Check if user already has this department assignment
    const existingAssignment = await this.userDepartmentRoleRepository.findOne({
      where: {
        userId,
        departmentId: assignmentDto.departmentId,
      },
    });

    if (existingAssignment) {
      throw new BadRequestException(
        'User already has this department assignment',
      );
    }

    const userDepartmentRole = this.userDepartmentRoleRepository.create({
      userId,
      departmentId: assignmentDto.departmentId,
      roleId: assignmentDto.roleId,
      isActive: true,
      assignedAt: new Date(),
    });

    const savedAssignment =
      await this.userDepartmentRoleRepository.save(userDepartmentRole);

    // Create permissions if provided
    if (assignmentDto.permissionIds && assignmentDto.permissionIds.length > 0) {
      for (const permissionId of assignmentDto.permissionIds) {
        const userDepartmentPermission =
          this.userDepartmentPermissionRepository.create({
            userDepartmentRoleId: savedAssignment.id,
            permissionId,
            isActive: true,
            grantedAt: new Date(),
          });

        await this.userDepartmentPermissionRepository.save(
          userDepartmentPermission,
        );
      }
    }

    return this.getAssignments(userId);
  }

  async updateAssignment(
    userId: string,
    assignmentId: string,
    updateAssignmentDto: UpdateAssignmentDto,
  ) {
    const assignment = await this.userDepartmentRoleRepository.findOne({
      where: { id: assignmentId, userId },
    });

    if (!assignment) {
      throw new NotFoundException('User assignment not found');
    }

    await this.userRepository.manager.transaction(async (manager) => {
      const assignmentRepository = manager.getRepository(UserDepartmentRole);
      const permissionRepository = manager.getRepository(
        UserDepartmentPermission,
      );
      const duplicateAssignment = await assignmentRepository.findOne({
        where: {
          userId,
          departmentId: updateAssignmentDto.departmentId,
        },
      });

      if (duplicateAssignment && duplicateAssignment.id !== assignmentId) {
        throw new BadRequestException(
          'User already has this department assignment',
        );
      }

      if (assignment.roleId !== updateAssignmentDto.roleId) {
        await this.assertAssignmentCanStopBeingSuperAdmin(
          userId,
          assignmentId,
        );
      }

      assignment.departmentId = updateAssignmentDto.departmentId;
      assignment.roleId = updateAssignmentDto.roleId;
      await assignmentRepository.save(assignment);

      await permissionRepository.delete({
        userDepartmentRoleId: assignmentId,
      });

      for (const permissionId of updateAssignmentDto.permissionIds ?? []) {
        await permissionRepository.save(
          permissionRepository.create({
            userDepartmentRoleId: assignmentId,
            permissionId,
            isActive: true,
            grantedAt: new Date(),
          }),
        );
      }
    });

    const updatedAssignment = (await this.getAssignments(userId)).find(
      (item) => item.id === assignmentId,
    );

    if (!updatedAssignment) {
      throw new NotFoundException('User assignment not found');
    }

    return updatedAssignment;
  }

  async removeAssignment(userId: string, assignmentId: string) {
    const assignment = await this.userDepartmentRoleRepository.findOne({
      where: { id: assignmentId, userId },
    });

    if (!assignment) {
      throw new NotFoundException('User assignment not found');
    }

    await this.assertAssignmentCanStopBeingSuperAdmin(userId, assignmentId);

    await this.userRepository.manager.transaction(async (manager) => {
      const assignmentRepository = manager.getRepository(UserDepartmentRole);
      const permissionRepository = manager.getRepository(
        UserDepartmentPermission,
      );

      await permissionRepository.delete({ userDepartmentRoleId: assignmentId });
      await assignmentRepository.delete({ id: assignmentId, userId });
    });

    return { message: 'User assignment deleted successfully' };
  }

  async remove(id: string) {
    const user = await this.findOne(id);

    await this.assertAssignmentCanStopBeingSuperAdmin(id);

    await this.userRepository.manager.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const assignmentRepository = manager.getRepository(UserDepartmentRole);
      const permissionRepository = manager.getRepository(
        UserDepartmentPermission,
      );
      const assignments = await assignmentRepository.find({
        where: { userId: id },
        select: ['id'],
      });
      const assignmentIds = assignments.map((assignment) => assignment.id);

      if (assignmentIds.length > 0) {
        await permissionRepository.delete({
          userDepartmentRoleId: In(assignmentIds),
        });
      }

      await assignmentRepository.delete({ userId: id });
      await userRepository.remove(user);
    });

    return { message: 'User deleted successfully' };
  }

  private async assertAssignmentCanStopBeingSuperAdmin(
    userId: string,
    assignmentId?: string,
  ) {
    const activeSuperAdminCount = await this.userDepartmentRoleRepository
      .createQueryBuilder('udr')
      .leftJoin('udr.role', 'role')
      .leftJoin('udr.user', 'user')
      .where('role.code = :code', { code: 'SUPER_ADMIN' })
      .andWhere('udr.isActive = :isActive', { isActive: true })
      .andWhere('user.isActive = :userIsActive', { userIsActive: true })
      .getCount();

    if (activeSuperAdminCount > 1) {
      return;
    }

    const assignmentQuery = this.userDepartmentRoleRepository
      .createQueryBuilder('udr')
      .leftJoin('udr.role', 'role')
      .leftJoin('udr.user', 'user')
      .where('udr.userId = :userId', { userId })
      .andWhere('role.code = :code', { code: 'SUPER_ADMIN' })
      .andWhere('udr.isActive = :isActive', { isActive: true })
      .andWhere('user.isActive = :userIsActive', { userIsActive: true });

    if (assignmentId) {
      assignmentQuery.andWhere('udr.id = :assignmentId', { assignmentId });
    }

    if (await assignmentQuery.getOne()) {
      throw new BadRequestException('Cannot remove the last super admin');
    }
  }
}
