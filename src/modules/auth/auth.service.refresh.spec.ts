import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { AuthSession } from '../../entities/iam/auth-session.entity';
import { User } from '../../entities/iam/user.entity';
import { RoleCode } from '../../common/enums/role-code.enum';

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

function harness() {
  const jwt = new JwtService({ signOptions: { expiresIn: '15m' } });
  const config = {
    getOrThrow: (key: string) =>
      key === 'JWT_REFRESH_SECRET'
        ? 'refresh-test-secret'
        : 'access-test-secret',
    get: (_key: string, fallback: unknown) => fallback,
  } as unknown as ConfigService;
  const claims = {
    sub: '1',
    sessionId: '2',
    userDepartmentRoleId: null,
    departmentId: null,
    roleCode: null as RoleCode | null,
    permissionVersion: 1,
  };
  const token = jwt.sign(claims, {
    secret: 'refresh-test-secret',
    expiresIn: '7d',
  });
  const session = {
    id: '2',
    userId: '1',
    activeUserDepartmentRoleId: null,
    refreshTokenHash: hash(token),
    previousRefreshTokenHash: null,
    refreshGraceUntil: null,
    refreshClaims: null,
    revokedAt: null,
    expiresAt: new Date(jwt.decode(token).exp * 1000),
  } as unknown as AuthSession;
  const user = {
    id: '1',
    isActive: true,
    isLocked: false,
    permissionVersion: 1,
  };
  const sessions = {
    findOne: jest.fn(async () => session),
    save: jest.fn(async (value: AuthSession) => {
      // PostgreSQL jsonb can reorder keys across a persistence boundary.
      if (value.refreshClaims) {
        value.refreshClaims = Object.fromEntries(
          Object.entries(value.refreshClaims).reverse(),
        );
      }
      return value;
    }),
    update: jest.fn(async (_where: unknown, values: Partial<AuthSession>) =>
      Object.assign(session, values),
    ),
  };
  const manager = {
    getRepository: (entity: unknown) =>
      entity === AuthSession
        ? sessions
        : entity === User
          ? { findOne: async () => user }
          : { findOne: async () => null },
  };
  let tail: Promise<unknown> = Promise.resolve();
  const repository = {
    ...sessions,
    manager: {
      transaction: <T>(work: (value: typeof manager) => Promise<T>) => {
        const next = tail.then(() => work(manager));
        tail = next.catch(() => undefined);
        return next;
      },
    },
  };
  const tokens = new TokenService(jwt, config);
  jest
    .spyOn(tokens, 'hashRefreshToken')
    .mockImplementation(async (value) => hash(value));
  jest
    .spyOn(tokens, 'compareRefreshToken')
    .mockImplementation(async (value, stored) => hash(value) === stored);
  const service = Object.assign(
    Object.create(AuthService.prototype) as AuthService,
    {
      jwtService: jwt,
      configService: config,
      tokenService: tokens,
      authSessionRepository: repository,
      buildAuthenticationResponse: jest.fn(
        async (
          _user: unknown,
          _assignment: unknown,
          accessToken: string,
          refreshToken: string,
        ) => ({
          success: true,
          data: { authentication: { accessToken, refreshToken } },
        }),
      ),
    },
  );
  return { service, session, user, token, jwt, sessions };
}

describe('Refresh token lifecycle', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rotates without replacing the session and preserves the absolute expiry', async () => {
    const h = harness();
    const expiry = h.session.expiresAt.getTime();
    const result = await h.service.refreshToken(h.token);
    const tokens = result.data.authentication;
    expect(tokens.refreshToken).not.toBe(h.token);
    expect(
      h.jwt.verify(tokens.accessToken, { secret: 'access-test-secret' }),
    ).toMatchObject({ sessionId: '2' });
    expect(
      h.jwt.verify(tokens.refreshToken, { secret: 'refresh-test-secret' }),
    ).toMatchObject({ sessionId: '2' });
    expect(h.session.expiresAt.getTime()).toBe(expiry);
    expect(h.session.revokedAt).toBeNull();
    expect(h.session.refreshTokenHash).toBe(hash(tokens.refreshToken));
    expect(h.sessions.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('ten concurrent tabs receive the same successor token', async () => {
    const h = harness();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => h.service.refreshToken(h.token)),
    );
    expect(
      new Set(results.map((r) => r.data.authentication.refreshToken)).size,
    ).toBe(1);
    expect(h.session.revokedAt).toBeNull();
    // Grace requests remain recoverable after the in-memory frontend lock is gone.
    const again = await h.service.refreshToken(h.token);
    expect(again.data.authentication.refreshToken).toBe(
      results[0].data.authentication.refreshToken,
    );
  });

  it('revokes reuse outside the grace period, and commits that revocation', async () => {
    const h = harness();
    await h.service.refreshToken(h.token);
    h.session.refreshGraceUntil = new Date(Date.now() - 1);
    await expect(h.service.refreshToken(h.token)).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_REVOKED' },
    });
    expect(h.session.revokedAt).toBeInstanceOf(Date);
    expect(h.sessions.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });

  it('rejects an expired refresh token before accessing a session', async () => {
    const h = harness();
    const expired = h.jwt.sign(
      { sub: '1', sessionId: '2' },
      { secret: 'refresh-test-secret', expiresIn: -1 },
    );
    await expect(h.service.refreshToken(expired)).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_EXPIRED' },
    });
    expect(h.sessions.findOne).not.toHaveBeenCalled();
  });

  it('rejects invalid signatures without revoking unrelated sessions', async () => {
    const h = harness();
    await expect(h.service.refreshToken('invalid')).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_INVALID' },
    });
    expect(h.sessions.save).not.toHaveBeenCalled();
  });

  it('rejects revoked and expired sessions with distinct codes', async () => {
    const h = harness();
    h.session.revokedAt = new Date();
    await expect(h.service.refreshToken(h.token)).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_REVOKED' },
    });
    h.session.revokedAt = null as unknown as Date;
    h.session.expiresAt = new Date(Date.now() - 1);
    await expect(h.service.refreshToken(h.token)).rejects.toMatchObject({
      response: { code: 'SESSION_EXPIRED' },
    });
  });

  it('disabled users cannot refresh', async () => {
    const h = harness();
    h.user.isActive = false;
    await expect(h.service.refreshToken(h.token)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_DISABLED' },
    });
    expect(h.session.revokedAt).toBeInstanceOf(Date);
  });

  it('refreshes throughout an hour while keeping the original session deadline', async () => {
    const start = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(start);
    const h = harness();
    const deadline = h.session.expiresAt.getTime();
    let token = h.token;
    for (let minute = 14; minute <= 70; minute += 14) {
      clock.mockReturnValue(start + minute * 60_000);
      const response = await h.service.refreshToken(token);
      token = response.data.authentication.refreshToken;
      expect(
        h.jwt.verify(response.data.authentication.accessToken, {
          secret: 'access-test-secret',
        }).sessionId,
      ).toBe('2');
      expect(h.session.revokedAt).toBeNull();
    }
    expect(h.session.expiresAt.getTime()).toBe(deadline);
  });

  it('logout revokes the current session using refresh credentials alone', async () => {
    const h = harness();
    await h.service.logoutWithRefreshToken(h.token);
    expect(h.session.revokedAt).toBeInstanceOf(Date);
    await expect(h.service.refreshToken(h.token)).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_REVOKED' },
    });
  });
});
