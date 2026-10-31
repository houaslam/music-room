import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FindOperator } from 'typeorm';
import { AuthController } from '../../src/auth/auth.controller.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { JWTStrategy } from '../../src/auth/strategies/jwt.strategy.js';
import { RateLimitGuard } from '../../src/auth/guards/throttle.guard.js';
import { RefreshTokenService } from '../../src/auth/refresh-tokens.service.js';
import { RefreshFamilies } from '../../src/auth/entities/refresh-families.entity.js';

const owner = '7c289d4c-ab51-4ed5-bbd0-d02fb59bc01a';
const other = '7c289d4c-ab51-4ed5-bbd0-d02fb59bc01b';
const jwt = new JwtService({
  secret: 'day-two-access',
  signOptions: { expiresIn: '1h' },
});
const refreshConfig = { secret: 'day-two-refresh', expiresIn: '7d' as const };
const headers = {
  'X-Platform': 'ios',
  'X-Device-Model': 'Test phone',
  'X-App-Version': '1.0.0',
  'X-Device-Id': '7c289d4c-ab51-4ed5-bbd0-d02fb59bc01c',
};

// Day 2 contract: protected, body-independent logoutAll(authenticatedUserId).
// Real routing/header/JWT checks; mocked persistence and disabled rate limiting.
describe('Day 2 logout-all HTTP acceptance', () => {
  let app: INestApplication;
  const service = { logoutAll: vi.fn() };
  beforeAll(async () => {
    Reflect.defineMetadata('design:paramtypes', [AuthService], AuthController);
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: service },
        {
          provide: JWTStrategy,
          useFactory: () =>
            new JWTStrategy(
              new ConfigService({ ACCESS_TOKEN_SECRET: 'day-two-access' }),
              {
                findOne: async ({ where }: { where: { id: string } }) =>
                  where.id === owner ? { id: owner } : null,
              } as never,
            ),
        },
      ],
    })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  it.each(['missing', 'expired', 'deleted'])(
    'rejects %s identity before revoking sessions',
    async (state) => {
      const call = request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set(headers);
      if (state !== 'missing')
        call.set(
          'Authorization',
          `Bearer ${jwt.sign(
            { sub: state === 'deleted' ? other : owner },
            { expiresIn: state === 'expired' ? -1 : '1h' },
          )}`,
        );
      const response = await call.send({}).expect(401);
      expect(response.body).toMatchObject({
        error: { code: 'INVALID_CREDENTIALS' },
      });
      expect(service.logoutAll).not.toHaveBeenCalled();
    },
  );

  it('returns empty 204 and ignores body identity and refresh-token overrides', async () => {
    const unrelatedRefresh = await jwt.signAsync(
      { sub: other, jti: randomUUID() },
      refreshConfig,
    );
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set(headers)
      .set('Authorization', `Bearer ${jwt.sign({ sub: owner })}`)
      .send({ user_id: other, id: other, refresh_token: unrelatedRefresh })
      .expect(204);
    expect(response.text).toBe('');
    expect(service.logoutAll).toHaveBeenCalledExactlyOnceWith(owner);
  });
});

// Real AuthService + RefreshTokenService + signed JWTs; in-memory transactional
// storage. These cases do not prove PostgreSQL locking or concurrent races.
describe('Day 2 logout-all session acceptance', () => {
  type Row = Record<string, any>;
  let families: Row[];
  let tokens: Row[];
  let service: AuthService;
  beforeEach(() => {
    families = [];
    tokens = [];
    const rows = (entity: unknown) =>
      entity === RefreshFamilies ? families : tokens;
    const matches = (row: Row, criteria: string | Row) =>
      typeof criteria === 'string'
        ? row.id === criteria
        : Object.entries(criteria).every(([key, value]) =>
            // IsNull() comes in as a FindOperator, the rest are plain values
            value instanceof FindOperator && value.type === 'isNull'
              ? row[key] === null || row[key] === undefined
              : row[key] === value,
          );
    const manager = {
      save: vi.fn(async (entity, value) => {
        const row = { id: randomUUID(), ...value };
        rows(entity).push(row);
        return row;
      }),
      insert: vi.fn(async (entity, value) => {
        rows(entity).push({ id: randomUUID(), ...value });
      }),
      findOne: vi.fn(
        async (entity, { where }) =>
          rows(entity).find((row) => matches(row, where)) ?? null,
      ),
      find: vi.fn(async (entity, { where }) =>
        rows(entity).filter((row) => matches(row, where)),
      ),
      update: vi.fn(async (entity, criteria, changes) => {
        const found = rows(entity).filter((row) => matches(row, criteria));
        found.forEach((row) => Object.assign(row, changes));
        return { affected: found.length };
      }),
    };
    const em = {
      ...manager,
      transaction: async (
        callback: (value: typeof manager) => Promise<unknown>,
      ) => {
        const snapshot = structuredClone({ families, tokens });
        try {
          return await callback(manager);
        } catch (error) {
          families = snapshot.families;
          tokens = snapshot.tokens;
          throw error;
        }
      },
    };
    const hasher = {
      hash: async (raw: string) => `hash:${raw}`,
      verify: async (raw: string, hash: string) => hash === `hash:${raw}`,
    };
    const refreshService = new RefreshTokenService(
      hasher as never,
      {} as never,
      jwt,
      refreshConfig,
    );
    service = new AuthService(
      jwt,
      refreshConfig,
      {} as never,
      refreshService,
      em as never,
      hasher as never,
      {} as never,
    );
  });
  const login = (s: AuthService, id = owner) =>
    s.login(
      { id },
      {
        platform: 'ios',
        deviceModel: 'Test phone',
        appVersion: '1.0.0',
        deviceId: randomUUID(),
      },
    );
  const rejectRefresh = (s: AuthService, token: string) =>
    expect(s.refresh({ refresh_token: token })).rejects.toMatchObject({
      status: 401,
      response: { error: { code: 'INVALID_REFRESH_TOKEN' } },
    });

  it('revokes every existing family across devices and repeated logins', async () => {
    const sessions = await Promise.all([
      login(service),
      login(service),
      login(service),
    ]);
    await service.logoutAll(owner);
    for (const session of sessions)
      await rejectRefresh(service, session.refresh_token);
  });
  it('revokes the newest rotated token as well as the original token', async () => {
    const first = await login(service);
    const current = await service.refresh({
      refresh_token: first.refresh_token,
    });
    await service.logoutAll(owner);
    await rejectRefresh(service, current.refresh_token);
    await rejectRefresh(service, first.refresh_token);
  });
  it('preserves another account and allows a fresh login afterward', async () => {
    const existing = await login(service);
    const unaffected = await login(service, other);
    await service.logoutAll(owner);
    await rejectRefresh(service, existing.refresh_token);
    await expect(
      service.refresh({ refresh_token: unaffected.refresh_token }),
    ).resolves.toHaveProperty('refresh_token');
    const fresh = await login(service);
    await expect(
      service.refresh({ refresh_token: fresh.refresh_token }),
    ).resolves.toHaveProperty('refresh_token');
  });
  it('succeeds repeatedly when the account has no active families', async () => {
    await expect(service.logoutAll(owner)).resolves.toBeUndefined();
    await expect(service.logoutAll(owner)).resolves.toBeUndefined();
  });
  it('keeps the original revoked_at of a family that was already logged out', async () => {
    const old = await login(service);
    await service.logout(old.refresh_token);
    const loggedOutAt = families[0].revoked_at;
    await login(service);
    await service.logoutAll(owner);
    expect(families[0].revoked_at).toBe(loggedOutAt);
    expect(families[1].revoked_at).toBeInstanceOf(Date);
  });
  it('keeps an issued access JWT valid while blocking the old refresh token', async () => {
    const session = await login(service);
    await service.logoutAll(owner);
    await expect(jwt.verifyAsync(session.access_token)).resolves.toMatchObject({
      sub: owner,
    });
    await rejectRefresh(service, session.refresh_token);
  });
});
