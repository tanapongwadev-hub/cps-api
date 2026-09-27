import 'reflect-metadata';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- isolated TypeORM transaction/repository mock harness */
import { AuthService } from './auth.service';
import { User } from '../../entities/iam/user.entity';
import { AuditLog } from '../../entities/iam/audit-log.entity';

describe('AuthService audit events', () => {
  it('writes auth.account.locked in the same transaction as the lock state', async () => {
    const user = {
      id: '42',
      username: 'operator',
      passwordHash: 'hash',
      isActive: true,
      isLocked: false,
      lockedUntil: null,
      failedLoginAttempts: 99,
    } as User;
    const users = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockResolvedValue(user),
    };
    const auditLogs = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getRepository: (entity: unknown) =>
        entity === User ? users : entity === AuditLog ? auditLogs : undefined,
    };
    const service = Object.assign(
      Object.create(AuthService.prototype) as AuthService,
      {
        userRepository: {
          findOne: jest.fn().mockResolvedValue(user),
          manager: {
            transaction: async (work: (value: typeof manager) => unknown) =>
              work(manager),
          },
        },
        passwordService: { compare: jest.fn().mockResolvedValue(false) },
      },
    );

    await expect(
      service.validateUser('operator', 'wrong-password'),
    ).resolves.toBeNull();

    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({ isLocked: true }),
    );
    expect(auditLogs.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'auth.account.locked',
        targetType: 'USER',
        targetId: '42',
        reason: 'MAX_FAILED_LOGIN_ATTEMPTS',
      }),
    );
  });
});
