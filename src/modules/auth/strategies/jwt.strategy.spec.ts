import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { RoleCode } from '../../../common/enums/role-code.enum';
import { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { AuthSession } from '../../../entities/iam/auth-session.entity';
import { User } from '../../../entities/iam/user.entity';
import { UserDepartmentRole } from '../../../entities/iam/user-department-role.entity';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy current session validation', () => {
  let users: { findOne: jest.Mock };
  let sessions: { findOne: jest.Mock };
  let assignments: { findOne: jest.Mock };
  let strategy: JwtStrategy;
  let payload: JwtPayload;

  beforeEach(() => {
    users = { findOne: jest.fn() };
    sessions = { findOne: jest.fn() };
    assignments = { findOne: jest.fn() };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    strategy = new JwtStrategy(
      config,
      users as unknown as Repository<User>,
      sessions as unknown as Repository<AuthSession>,
      assignments as unknown as Repository<UserDepartmentRole>,
    );
    payload = {
      sub: '7',
      sessionId: '9',
      userDepartmentRoleId: '10',
      departmentId: '3',
      roleCode: RoleCode.ADMIN,
      permissionVersion: 4,
    };
    users.findOne.mockResolvedValue({
      id: '7',
      isActive: true,
      isLocked: false,
      permissionVersion: 4,
    });
    sessions.findOne.mockResolvedValue({
      id: '9',
      userId: '7',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    assignments.findOne.mockResolvedValue({
      id: '10',
      userId: '7',
      departmentId: '3',
      roleId: '5',
      role: { code: RoleCode.ADMIN },
      isActive: true,
      expiredAt: null,
    });
  });

  it('returns context from the current assignment for a valid session', async () => {
    await expect(strategy.validate(payload)).resolves.toEqual({
      id: '7',
      sessionId: '9',
      activeUserDepartmentRoleId: '10',
      activeDepartmentId: '3',
      activeRoleCode: RoleCode.ADMIN,
      permissionVersion: 4,
    });
  });

  it('rejects a token whose permission version is stale', async () => {
    users.findOne.mockResolvedValue({
      id: '7',
      isActive: true,
      isLocked: false,
      permissionVersion: 5,
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a revoked session', async () => {
    sessions.findOne.mockResolvedValue({
      id: '9',
      userId: '7',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired session', async () => {
    sessions.findOne.mockResolvedValue({
      id: '9',
      userId: '7',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an inactive or locked user', async () => {
    users.findOne.mockResolvedValue({
      id: '7',
      isActive: false,
      isLocked: false,
      permissionVersion: 4,
    });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    users.findOne.mockResolvedValue({
      id: '7',
      isActive: true,
      isLocked: true,
      permissionVersion: 4,
    });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a removed or expired active assignment', async () => {
    assignments.findOne.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    assignments.findOne.mockResolvedValue({
      id: '10',
      userId: '7',
      departmentId: '3',
      role: { code: RoleCode.ADMIN },
      isActive: true,
      expiredAt: new Date(Date.now() - 1),
    });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects stale department or role context embedded in the token', async () => {
    assignments.findOne.mockResolvedValue({
      id: '10',
      userId: '7',
      departmentId: '4',
      role: { code: RoleCode.USER },
      isActive: true,
      expiredAt: null,
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a valid session without an assignment context', async () => {
    payload = {
      ...payload,
      userDepartmentRoleId: null,
      departmentId: null,
      roleCode: null as unknown as RoleCode,
    };

    await expect(strategy.validate(payload)).resolves.toEqual({
      id: '7',
      sessionId: '9',
      activeUserDepartmentRoleId: null,
      activeDepartmentId: null,
      activeRoleCode: null,
      permissionVersion: 4,
    });
    expect(assignments.findOne).not.toHaveBeenCalled();
  });
});
