import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../../entities/iam/user.entity';
import { UserDepartmentRole } from '../../entities/iam/user-department-role.entity';
import { UserDepartmentPermission } from '../../entities/iam/user-department-permission.entity';
import { Department } from '../../entities/iam/department.entity';
import { Role } from '../../entities/iam/role.entity';
import { Action } from '../../entities/iam/action.entity';
import { RoleAction } from '../../entities/iam/role-action.entity';
import { Permission } from '../../entities/iam/permission.entity';
import { Menu } from '../../entities/iam/menu.entity';
import { AuthSession } from '../../entities/iam/auth-session.entity';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { RoleCode } from '../../common/enums/role-code.enum';
import { AccessControlService } from '../access-control/access-control.service';
import { EffectivePermissionService } from '../access-control/services/effective-permission.service';
import { MenuTreeService } from '../access-control/services/menu-tree.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import {
  UserInactiveException,
  UserLockedException,
} from '../../common/exceptions/custom-exceptions';
import { getEnvNumber } from '../../config/env.utils';
import { randomUUID } from 'node:crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserDepartmentRole)
    private userDepartmentRoleRepository: Repository<UserDepartmentRole>,
    @InjectRepository(UserDepartmentPermission)
    private userDepartmentPermissionRepository: Repository<UserDepartmentPermission>,
    @InjectRepository(Department)
    private departmentRepository: Repository<Department>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(Action)
    private actionRepository: Repository<Action>,
    @InjectRepository(RoleAction)
    private roleActionRepository: Repository<RoleAction>,
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    @InjectRepository(Menu)
    private menuRepository: Repository<Menu>,
    @InjectRepository(AuthSession)
    private authSessionRepository: Repository<AuthSession>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private accessControlService: AccessControlService,
    private effectivePermissionService: EffectivePermissionService,
    private menuTreeService: MenuTreeService,
    private passwordService: PasswordService,
    private tokenService: TokenService,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.userRepository.findOne({
      where: { username: username.toLowerCase() },
    });

    if (!user) {
      return null;
    }

    if (!user.isActive) {
      throw new UserInactiveException();
    }

    if (user.isLocked) {
      // Check if lock period has expired
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new UserLockedException();
      } else {
        // Unlock the account
        user.isLocked = false;
        user.lockedUntil = null;
        user.failedLoginAttempts = 0;
        await this.userRepository.save(user);
      }
    }

    const isPasswordValid = await this.passwordService.compare(
      password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      // Increment failed login attempts
      user.failedLoginAttempts += 1;
      const maxAttempts = getEnvNumber('MAX_FAILED_LOGIN_ATTEMPTS', 5);

      if (user.failedLoginAttempts >= maxAttempts) {
        user.isLocked = true;
        const lockMinutes = getEnvNumber('ACCOUNT_LOCK_MINUTES', 15);
        user.lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
      }

      await this.userRepository.save(user);
      return null;
    }

    // Reset failed login attempts on successful login
    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      await this.userRepository.save(user);
    }

    return user;
  }

  async login(user: User) {
    this.logger.debug(
      `Login attempt for user id: ${user.id}, username: ${user.username}`,
    );

    // Load active user department roles with explicit NULL handling for system-wide admins
    const assignments = await this.userDepartmentRoleRepository
      .createQueryBuilder('udr')
      .leftJoinAndSelect('udr.department', 'department')
      .leftJoinAndSelect('udr.role', 'role')
      .where('udr.userId = :userId', { userId: user.id })
      .andWhere('udr.isActive = :isActive', { isActive: true })
      .andWhere('(udr.expiredAt IS NULL OR udr.expiredAt > :now)', {
        now: new Date(),
      })
      .andWhere('role.isActive = :roleActive', { roleActive: true })
      .getMany();

    this.logger.debug(
      `Found ${assignments.length} raw assignments for user ${user.id}`,
    );
    assignments.forEach((a, index) => {
      this.logger.debug(
        `Assignment ${index}: id=${a.id}, role=${a.role?.code}, departmentId=${a.department?.id || 'NULL'}, departmentActive=${a.department?.isActive ?? 'N/A'}`,
      );
    });

    // Filter assignments: allow system-wide admins (NULL department) or active departments
    const validAssignments = assignments.filter(
      (a) => !a.department || a.department.isActive,
    );

    this.logger.debug(
      `Found ${validAssignments.length} valid assignments after filter`,
    );

    const superAdminAssignment = validAssignments.find(
      (a) => a.role.code === RoleCode.SUPER_ADMIN,
    );

    // If SUPER_ADMIN, allow login without department selection
    if (superAdminAssignment) {
      this.logger.debug(`Super admin assignment found, generating tokens`);
      return await this.generateTokens(user, superAdminAssignment);
    }

    // If only one department assignment, auto-select
    if (validAssignments.length === 1) {
      this.logger.debug(`Single assignment found, auto-selecting department`);
      return await this.generateTokens(user, validAssignments[0]);
    }

    // If multiple departments, return selection options
    const departments = validAssignments.map((assignment) => ({
      userDepartmentRoleId: assignment.id,
      departmentId: assignment.department?.id,
      departmentCode: assignment.department?.code,
      departmentName: assignment.department?.nameTh,
      roleCode: assignment.role?.code,
    }));

    // Generate a short-lived token for department selection
    const departmentSelectionToken = this.jwtService.sign(
      { sub: user.id },
      {
        secret: this.configService.getOrThrow<string>(
          'JWT_DEPARTMENT_SELECTION_SECRET',
        ),
        expiresIn: this.configService.get(
          'JWT_DEPARTMENT_SELECTION_EXPIRES_IN',
          '5m',
        ),
      },
    );

    this.logger.debug(
      `Returning department selection options: ${JSON.stringify(departments)}`,
    );

    return {
      requiresDepartmentSelection: true,
      departmentSelectionToken,
      departments,
    };
  }

  async selectDepartment(userId: string, userDepartmentRoleId: string) {
    const assignment = await this.userDepartmentRoleRepository
      .createQueryBuilder('udr')
      .leftJoinAndSelect('udr.department', 'department')
      .leftJoinAndSelect('udr.role', 'role')
      .where('udr.id = :id', { id: userDepartmentRoleId })
      .andWhere('udr.userId = :userId', { userId })
      .andWhere('udr.isActive = :isActive', { isActive: true })
      .andWhere('(udr.expiredAt IS NULL OR udr.expiredAt > :now)', {
        now: new Date(),
      })
      .getOne();

    if (!assignment) {
      throw new UnauthorizedException('Invalid department assignment');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return await this.generateTokens(user, assignment);
  }

  async switchDepartment(userId: string, userDepartmentRoleId: string) {
    return await this.selectDepartment(userId, userDepartmentRoleId);
  }

  private verifyRefreshToken(token: string): JwtPayload {
    const secret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret,
        algorithms: ['HS256'],
      });
      if (!payload.sub || !payload.sessionId) throw new Error('Invalid claims');
      return payload;
    } catch (error) {
      throw new UnauthorizedException({
        code:
          error instanceof Error && error.name === 'TokenExpiredError'
            ? 'REFRESH_TOKEN_EXPIRED'
            : 'REFRESH_TOKEN_INVALID',
        message: 'Refresh token rejected',
      });
    }
  }

  async refreshToken(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);
    // The database lock serializes rotation across API workers and browser tabs.
    // Return terminal errors from the transaction so revocation is committed.
    const result = await this.authSessionRepository.manager.transaction(
      async (manager) => {
        const sessions = manager.getRepository(AuthSession);
        const session = await sessions.findOne({
          where: { id: payload.sessionId, userId: payload.sub },
          lock: { mode: 'pessimistic_write' },
        });
        const failure = (code: string) => ({ error: code }) as const;
        if (!session) return failure('REFRESH_TOKEN_INVALID');
        if (session.revokedAt) return failure('REFRESH_TOKEN_REVOKED');
        const now = Date.now();
        if (new Date(session.expiresAt).getTime() <= now)
          return failure('SESSION_EXPIRED');
        const current = await this.tokenService.compareRefreshToken(
          refreshToken,
          session.refreshTokenHash,
        );
        const previous =
          !current &&
          session.previousRefreshTokenHash &&
          (await this.tokenService.compareRefreshToken(
            refreshToken,
            session.previousRefreshTokenHash,
          ));
        if (
          !current &&
          !(
            previous &&
            session.refreshGraceUntil &&
            new Date(session.refreshGraceUntil).getTime() > now
          )
        ) {
          session.revokedAt = new Date(now);
          await sessions.save(session);
          return failure('REFRESH_TOKEN_REVOKED');
        }
        const user = await manager
          .getRepository(User)
          .findOne({ where: { id: payload.sub } });
        if (
          !user ||
          !user.isActive ||
          user.isLocked ||
          user.permissionVersion !== payload.permissionVersion
        ) {
          session.revokedAt = new Date(now);
          await sessions.save(session);
          return failure(
            !user || !user.isActive || user.isLocked
              ? 'ACCOUNT_DISABLED'
              : 'SESSION_REVOKED',
          );
        }
        const assignment = session.activeUserDepartmentRoleId
          ? await manager.getRepository(UserDepartmentRole).findOne({
              where: {
                id: session.activeUserDepartmentRoleId,
                userId: user.id,
              },
              relations: ['role', 'department'],
            })
          : null;
        if (
          session.activeUserDepartmentRoleId &&
          (!assignment ||
            !assignment.isActive ||
            (assignment.expiredAt &&
              new Date(assignment.expiredAt).getTime() <= now) ||
            !assignment.role?.isActive ||
            (assignment.department && !assignment.department.isActive))
        ) {
          session.revokedAt = new Date(now);
          await sessions.save(session);
          return failure('SESSION_REVOKED');
        }
        const claims: JwtPayload = {
          sub: user.id,
          sessionId: session.id,
          userDepartmentRoleId: assignment?.id ?? null,
          departmentId: assignment?.departmentId ?? null,
          roleCode: (assignment?.role?.code as RoleCode) ?? null,
          permissionVersion: user.permissionVersion,
        };
        if (current) {
          session.previousRefreshTokenHash = session.refreshTokenHash;
          session.refreshGraceUntil = new Date(now + 30_000);
          session.refreshClaims = {
            ...claims,
            jti: randomUUID(),
            iat: Math.floor(now / 1000),
            exp: Math.floor(new Date(session.expiresAt).getTime() / 1000),
          };
        }
        if (!session.refreshClaims) return failure('REFRESH_TOKEN_INVALID');
        // Only non-secret signed claims are stored. Concurrent retries reconstruct
        // the identical successor token instead of creating another generation.
        const stored = session.refreshClaims;
        // jsonb does not preserve object key order. Canonicalize before signing
        // so every worker reconstructs byte-for-byte identical JWTs.
        const refreshClaims = Object.fromEntries(
          Object.keys(stored)
            .filter((key) => key !== 'exp')
            .sort()
            .map((key) => [key, stored[key]]),
        );
        const successor = this.jwtService.sign(refreshClaims, {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          algorithm: 'HS256',
          expiresIn: Number(stored.exp) - Number(refreshClaims.iat),
        });
        if (current)
          session.refreshTokenHash =
            await this.tokenService.hashRefreshToken(successor);
        session.lastUsedAt = new Date(now);
        await sessions.save(session);
        const accessToken = this.tokenService.signAccess({ ...claims });
        return {
          user,
          assignment,
          authentication: {
            accessToken,
            refreshToken: successor,
            tokenType: 'Bearer',
            expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
          },
        };
      },
    );
    if ('error' in result) {
      throw new UnauthorizedException({
        code: result.error,
        message: 'Authentication session cannot be refreshed',
      });
    }
    return this.buildAuthenticationResponse(
      result.user,
      result.assignment,
      result.authentication.accessToken,
      result.authentication.refreshToken,
    );
  }

  async logoutWithRefreshToken(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);
    // A signed token identifies its session even after rotation. Revoking is
    // deliberately idempotent and does not require a live access token.
    await this.authSessionRepository.update(
      { id: payload.sessionId, userId: payload.sub },
      { revokedAt: new Date() },
    );
  }

  async logout(sessionId: string) {
    await this.authSessionRepository.update(
      { id: sessionId },
      { revokedAt: new Date() },
    );
  }

  private async generateTokens(
    user: User,
    assignment: UserDepartmentRole | null,
  ) {
    const payload: JwtPayload = {
      sub: user.id,
      sessionId: '', // Will be set after session creation
      userDepartmentRoleId: assignment?.id || null,
      departmentId: assignment?.departmentId || null,
      roleCode: (assignment?.role?.code as RoleCode) || null,
      permissionVersion: user.permissionVersion,
    };

    // Create session
    const session = new AuthSession();
    session.userId = user.id;
    session.activeUserDepartmentRoleId = assignment?.id || null;
    session.refreshTokenHash = ''; // Will be set after token generation
    // Set below from the signed refresh token so JWT and session TTL agree.
    session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const savedSession = await this.authSessionRepository.save(session);
    payload.sessionId = savedSession.id;

    // Generate tokens
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    // Hash refresh token and update session
    const refreshTokenHash =
      await this.tokenService.hashRefreshToken(refreshToken);
    savedSession.refreshTokenHash = refreshTokenHash;
    const refreshClaims = this.jwtService.decode(refreshToken);
    savedSession.expiresAt = new Date(refreshClaims.exp * 1000);
    await this.authSessionRepository.save(savedSession);

    // Update last login
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    return this.buildAuthenticationResponse(
      user,
      assignment,
      accessToken,
      refreshToken,
    );
  }

  private async buildAuthenticationResponse(
    user: User,
    assignment: UserDepartmentRole | null,
    accessToken: string,
    refreshToken: string,
  ) {
    const assignments = await this.userDepartmentRoleRepository
      .createQueryBuilder('udr')
      .leftJoinAndSelect('udr.department', 'department')
      .leftJoinAndSelect('udr.role', 'role')
      .where('udr.userId = :userId', { userId: user.id })
      .andWhere('udr.isActive = true')
      .andWhere('(udr.expiredAt IS NULL OR udr.expiredAt > :now)', {
        now: new Date(),
      })
      .getMany();
    const isSuperAdmin = assignment?.role?.code === RoleCode.SUPER_ADMIN;
    const permissionCodes =
      await this.effectivePermissionService.getEffectivePermissionCodes(
        user.id,
        assignment?.id,
        isSuperAdmin,
      );
    const menus = await this.accessControlService.getMenusWithPermissions();
    const menuTree = this.menuTreeService.buildMenuTree(
      menus,
      permissionCodes,
      isSuperAdmin,
    );
    const currentDepartmentRole = assignment
      ? {
          id: assignment.id,
          userId: assignment.userId,
          departmentId: assignment.departmentId,
          departmentName: assignment.department?.nameTh ?? null,
          departmentCode: assignment.department?.code ?? null,
          roleId: assignment.roleId,
          roleName: assignment.role.nameTh,
          roleCode: assignment.role.code,
          isPrimary: false,
          isActive: assignment.isActive,
          createdAt: assignment.createdAt,
          updatedAt: assignment.updatedAt,
        }
      : null;

    return {
      success: true,
      message: 'Login successful',
      data: {
        authentication: {
          accessToken,
          refreshToken,
          tokenType: 'Bearer',
          expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
        },
        user: {
          id: user.id,
          username: user.username,
          employeeCode:
            (user as User & { employeeCode?: string }).employeeCode ?? null,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
          isSuperAdmin,
          departments: assignments
            .filter(
              (item): item is UserDepartmentRole & { department: Department } =>
                item.department !== null,
            )
            .map((item) => ({
              id: item.department.id,
              code: item.department.code,
              name: item.department.nameTh,
            }))
            .filter(
              (item, index, all) =>
                all.findIndex((other) => other.id === item.id) === index,
            ),
          roles: assignments
            .filter((item) => item.role)
            .map((item) => ({
              id: item.role.id,
              code: item.role.code,
              name: item.role.nameTh,
            }))
            .filter(
              (item, index, all) =>
                all.findIndex((other) => other.id === item.id) === index,
            ),
        },
        currentDepartmentRole,
        accessControl: {
          menus: menuTree,
          permissions: permissionCodes,
          userDepartmentRoleId: assignment?.id ?? null,
          departmentId: assignment?.departmentId ?? null,
          roleId: assignment?.roleId ?? null,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  async getMe(userId: string, userDepartmentRoleId: string | null) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const assignment = userDepartmentRoleId
      ? await this.userDepartmentRoleRepository.findOne({
          where: {
            id: userDepartmentRoleId,
            userId,
            isActive: true,
          },
          relations: ['department', 'role'],
        })
      : null;
    const response = await this.buildAuthenticationResponse(
      user,
      assignment,
      '',
      '',
    );
    response.data.authentication.refreshToken = undefined as never;
    return response;
  }

  async getMyMenus(roleCode: RoleCode) {
    const menus = await this.menuRepository.find({
      where: { isActive: true, isVisible: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    const allowedMenuIds =
      roleCode === RoleCode.SUPER_ADMIN
        ? new Set(menus.map((m) => m.id))
        : await this.getAllowedMenuIds(roleCode);

    const menuMap = new Map<string, any>();
    menus.forEach((menu) => {
      if (allowedMenuIds.has(menu.id)) {
        menuMap.set(menu.id, { ...menu, children: [] });
      }
    });

    const rootMenus: any[] = [];
    menus.forEach((menu) => {
      if (!allowedMenuIds.has(menu.id)) return;

      const menuNode = menuMap.get(menu.id);
      if (menu.parentId && menuMap.has(menu.parentId)) {
        const parent = menuMap.get(menu.parentId);
        parent.children.push(menuNode);
      } else {
        rootMenus.push(menuNode);
      }
    });

    return { menus: rootMenus };
  }

  async getMyPermissions(userId: string, roleCode: RoleCode) {
    const isSuperAdmin = roleCode === RoleCode.SUPER_ADMIN;
    const permissionCodes =
      await this.effectivePermissionService.getEffectivePermissionCodes(
        userId,
        undefined,
        isSuperAdmin,
      );
    const permissions =
      permissionCodes.length === 0
        ? []
        : await this.permissionRepository.find({
            where: { code: In(permissionCodes), isActive: true },
            relations: ['menu', 'action'],
          });

    return { permissions };
  }

  private async getAllowedMenuIds(roleCode: RoleCode): Promise<Set<string>> {
    const roleActions = await this.roleActionRepository.find({
      where: { role: { code: roleCode }, isActive: true },
      relations: ['action'],
    });

    const actionIds = roleActions.map((ra) => ra.actionId);

    const permissions = await this.permissionRepository.find({
      where: { actionId: { $in: actionIds } as any, isActive: true },
    });

    const allowedMenuIds = new Set<string>();
    const menuIds = permissions.map((p) => p.menuId);

    const menus = await this.menuRepository.find({
      where: { id: { $in: menuIds } as any },
    });

    const addMenuAndParents = (menuId: string, menuMap: Map<string, Menu>) => {
      if (allowedMenuIds.has(menuId)) return;
      allowedMenuIds.add(menuId);
      const menu = menuMap.get(menuId);
      if (menu?.parentId) {
        addMenuAndParents(menu.parentId, menuMap);
      }
    };

    const menuMap = new Map<string, Menu>();
    menus.forEach((m) => menuMap.set(m.id, m));

    menuIds.forEach((menuId) => addMenuAndParents(menuId, menuMap));

    return allowedMenuIds;
  }
}
