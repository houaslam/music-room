import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import {
  HttpException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { FindOperator } from 'typeorm';
import { AuthService } from '../../src/auth/auth.service.js';
import { OAuthService } from '../../src/auth/oauth.service.js';
import { OAuthController } from '../../src/auth/oauth.controller.js';
import { GoogleAuthGuard } from '../../src/auth/guards/google.guard.js';
import { RateLimitGuard } from '../../src/auth/guards/throttle.guard.js';
import { RefreshTokenService } from '../../src/auth/refresh-tokens.service.js';
import { Users } from '../../src/user/entities/user.entity.js';
import { Profiles } from '../../src/profile/entities/profiles.entity.js';
import { RefreshFamilies } from '../../src/auth/entities/refresh-families.entity.js';
import { RefreshTokens } from '../../src/auth/entities/refresh-tokens.entity.js';
import { GoogleAccounts } from '../../src/auth/entities/google-accounts.entity.js';

const device = {
  platform: 'ios',
  deviceModel: 'Test phone',
  appVersion: '1.0.0',
  deviceId: randomUUID(),
};
const principal = () => ({
  id: 'google-subject-123',
  email: 'ada@example.test',
  email_verified: true,
  name: 'Ada Lovelace',
});
type Row = Record<string, any>;

// The repository/transaction adapter is intentionally in memory. It verifies
// observable business behavior, not PostgreSQL constraints, locks or race safety.
function setup() {
  const tables = new Map<unknown, Row[]>();
  const rows = (entity: unknown): Row[] => {
    if (!tables.has(entity)) tables.set(entity, []);
    return tables.get(entity)!;
  };
  const matches = (row: Row, criteria: any): boolean =>
    typeof criteria === 'string'
      ? row.id === criteria
      : Object.entries(criteria ?? {}).every(([key, value]) =>
          value instanceof FindOperator && value.type === 'isNull'
            ? row[key] === null || row[key] === undefined
            : value && typeof value === 'object'
              ? matches(row[key] ?? {}, value)
              : row[key] === value,
        );
  const repository = (entity: unknown) => ({
    create: (value: Row) => ({ ...value }),
    save: (value: Row) => manager.save(entity, value),
    findOne: (options: Row) => manager.findOne(entity, options),
    find: (options: Row) => manager.find(entity, options),
    insert: (value: Row) => manager.insert(entity, value),
    update: (criteria: Row, value: Row) =>
      manager.update(entity, criteria, value),
  });
  const manager = {
    getRepository: repository,
    create: (_entity: unknown, value: Row) => ({ ...value }),
    save: vi.fn(async (entity: unknown, value: Row) => {
      if (failure.entity === entity)
        throw new Error('simulated persistence failure');
      if (failure.identity && entity === GoogleAccounts)
        throw new Error('simulated identity persistence failure');
      const existing =
        value.id && rows(entity).find((row) => row.id === value.id);
      if (existing) return Object.assign(existing, value);
      const saved = { id: randomUUID(), ...value };
      rows(entity).push(saved);
      return saved;
    }),
    insert: vi.fn(async (entity: unknown, value: Row) => {
      const saved = await manager.save(entity, value);
      return { identifiers: [{ id: saved.id }] };
    }),
    findOne: vi.fn(async (entity: unknown, options: Row) => {
      const row = rows(entity).find((row) => matches(row, options.where));
      if (!row) return null;
      if (entity === GoogleAccounts && options.relations?.users_id) {
        return {
          ...row,
          users_id: rows(Users).find((user) => user.id === row.users_id.id),
        };
      }
      return row;
    }),
    find: vi.fn(async (entity: unknown, options: Row) =>
      rows(entity).filter((row) => matches(row, options?.where)),
    ),
    update: vi.fn(async (entity: unknown, criteria: any, value: Row) => {
      const found = rows(entity).filter((row) => matches(row, criteria));
      found.forEach((row) => Object.assign(row, value));
      return { affected: found.length };
    }),
  };
  const failure: { entity?: unknown; identity?: boolean } = {};
  const em = {
    ...manager,
    transaction: vi.fn(
      async (callback: (m: typeof manager) => Promise<any>) => {
        const snapshot = new Map(
          [...tables].map(([entity, values]) => [
            entity,
            structuredClone(values),
          ]),
        );
        try {
          return await callback(manager);
        } catch (error) {
          tables.clear();
          snapshot.forEach((values, entity) => tables.set(entity, values));
          throw error;
        }
      },
    ),
  };
  const userService = {
    read: vi.fn(
      async ({ email }) =>
        rows(Users).find((row) => row.email === email) ?? null,
    ),
    findById: vi.fn(
      async (id) => rows(Users).find((row) => row.id === id) ?? null,
    ),
    create: vi.fn((value) => manager.save(Users, value)),
    assertAccountNotLocked: vi.fn((user) => {
      if (user.unlock_at && user.unlock_at > new Date())
        throw new HttpException({ error: { code: 'ACCOUNT_LOCKED' } }, 429);
    }),
  };
  const jwt = new JwtService({
    secret: 'oauth-test-access',
    signOptions: { expiresIn: '15m' },
  });
  const refreshConfig = {
    secret: 'oauth-test-refresh',
    expiresIn: '7d' as const,
  };
  const hasher = {
    hash: vi.fn(async (value: string) => `hash:${value}`),
    verify: vi.fn(async (raw: string, hash: string) => hash === `hash:${raw}`),
  };
  const refresh = new RefreshTokenService(
    hasher as never,
    {} as never,
    jwt,
    refreshConfig,
  );
  const service = new AuthService(
    userService as never,
    refresh,
    em as never,
    hasher as never,
    {} as never,
  );
  const oauthService = new OAuthService(em as never);
  const signIn = async (user: any = principal(), extra: Row = {}) => {
    const req = { user, device, ...extra };
    const account = await oauthService.oauth(req);
    return {
      ...(await service.login(account, device)),
      is_new_user: account.is_new_user,
    };
  };
  return {
    service,
    oauthService,
    signIn,
    rows,
    tables,
    failure,
    jwt,
    refresh,
    em,
    hasher,
    userService,
  };
}

describe('Day 3 OAuth account and session acceptance', () => {
  let h: ReturnType<typeof setup>;
  beforeEach(() => {
    h = setup();
  });
  const rejects = (promise: Promise<any>, status: number, code: string) =>
    expect(promise).rejects.toMatchObject({
      status,
      response: { error: { code } },
    });

  it.each([undefined, null, {}])(
    'rejects an absent or incomplete trusted principal (%s)',
    async (user) => {
      // Explicit undefined must not trigger signIn's default argument.
      await rejects(
        h.oauthService.oauth({ user }) as Promise<any>,
        401,
        'OAUTH_INVALID',
      );
      expect(h.rows(Users)).toHaveLength(0);
      expect(h.rows(RefreshFamilies)).toHaveLength(0);
    },
  );

  it('rejects a missing Google subject before creating any account', async () => {
    await rejects(h.signIn({ ...principal(), id: '' }), 401, 'OAUTH_INVALID');
    expect(h.rows(Users)).toHaveLength(0);
  });

  it('requires an email address', async () => {
    await rejects(
      h.signIn({ ...principal(), email: undefined }),
      422,
      'OAUTH_EMAIL_MISSING',
    );
    expect(h.rows(Users)).toHaveLength(0);
  });

  it('does not trust an unverified email', async () => {
    await rejects(
      h.signIn({ ...principal(), email_verified: false }),
      401,
      'OAUTH_INVALID',
    );
    expect(h.rows(Users)).toHaveLength(0);
  });

  it('creates one passwordless verified account, profile and persisted provider identity', async () => {
    const result = await h.signIn();
    expect(result).toMatchObject({ is_new_user: true });
    expect(h.rows(Users)).toHaveLength(1);
    const user = h.rows(Users)[0];
    expect(user).toMatchObject({
      email: 'ada@example.test',
      password_hash: null,
    });
    expect(user.email_verified_at).toBeInstanceOf(Date);
    expect(h.rows(Profiles)).toHaveLength(1);
    expect(h.rows(Profiles)[0]).toMatchObject({ user_id: user.id });
    const identities = h.rows(GoogleAccounts);
    expect(identities).toEqual([
      expect.objectContaining({
        google_user_id: 'google-subject-123',
        users_id: { id: user.id },
      }),
    ]);
  });

  it('issues application JWTs for the local user and stores a hashed refresh token with device metadata', async () => {
    const result = await h.signIn();
    const user = h.rows(Users)[0];
    expect(result).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      expires_in: 900,
    });
    await expect(h.jwt.verifyAsync(result.access_token)).resolves.toMatchObject(
      { sub: user.id },
    );
    await expect(
      h.refresh.readRefreshClaims(result.refresh_token),
    ).resolves.toMatchObject({ sub: user.id });
    expect(h.rows(RefreshFamilies)).toEqual([
      expect.objectContaining({ user_id: user.id, device_id: device.deviceId }),
    ]);
    expect(h.rows(RefreshTokens)).toHaveLength(1);
    expect(h.rows(RefreshTokens)[0].token_hash).toBe(
      `hash:${result.refresh_token}`,
    );
    expect(h.rows(RefreshTokens)[0].token_hash).not.toBe(result.refresh_token);
  });

  it('signs in the same provider identity twice without duplicating the account or profile', async () => {
    await h.signIn();
    const second = await h.signIn();
    expect(second.is_new_user).toBe(false);
    expect(h.rows(Users)).toHaveLength(1);
    expect(h.rows(Profiles)).toHaveLength(1);
    expect(h.rows(RefreshFamilies)).toHaveLength(2);
  });

  it('identifies returning Google users by subject even after the provider email changes', async () => {
    const first = await h.signIn();
    const next = await h.signIn({
      ...principal(),
      email: 'changed@example.test',
    });
    expect(next.is_new_user).toBe(false);
    expect(h.jwt.decode(next.access_token).sub).toBe(
      h.jwt.decode(first.access_token).sub,
    );
    expect(h.rows(Users)).toHaveLength(1);
  });

  it('requires authenticated linking instead of taking over an existing password account by email', async () => {
    const existing = {
      id: randomUUID(),
      email: principal().email,
      password_hash: 'existing-hash',
    };
    h.rows(Users).push(existing);
    await rejects(h.signIn(), 409, 'LINK_REQUIRED');
    expect(h.rows(Users)).toEqual([existing]);
    expect(h.rows(RefreshFamilies)).toHaveLength(0);
  });

  it('does not merge a different Google subject with an existing OAuth account by email', async () => {
    await h.signIn();
    await rejects(
      h.signIn({
        ...principal(),
        id: 'different-google-subject',
      }),
      409,
      'LINK_REQUIRED',
    );
    expect(h.rows(Users)).toHaveLength(1);
    expect(h.rows(RefreshFamilies)).toHaveLength(1);
  });

  it('ignores account IDs and provider credentials supplied in the request body', async () => {
    const forged = randomUUID();
    const result = await h.signIn(principal(), {
      body: { user_id: forged, accessToken: 'attacker-token' },
    });
    expect(h.jwt.decode(result.access_token).sub).toBe(h.rows(Users)[0].id);
    expect(h.jwt.decode(result.access_token).sub).not.toBe(forged);
    expect(JSON.stringify(result)).not.toContain('attacker-token');
    expect(result).not.toHaveProperty('password_hash');
  });

  it('rolls back account creation if profile persistence fails and issues no session', async () => {
    h.failure.entity = Profiles;
    await expect(h.signIn()).rejects.toBeDefined();
    expect(h.em.save).toHaveBeenCalledWith(Profiles, expect.any(Object));
    expect(h.rows(Users)).toHaveLength(0);
    expect(h.rows(Profiles)).toHaveLength(0);
    expect(h.rows(RefreshFamilies)).toHaveLength(0);
    expect(h.rows(RefreshTokens)).toHaveLength(0);
  });

  it('rolls back a partially created session if refresh-token persistence fails', async () => {
    h.failure.entity = RefreshTokens;
    await expect(h.signIn()).rejects.toBeDefined();
    expect(h.em.save).toHaveBeenCalledWith(RefreshTokens, expect.any(Object));
    expect(h.rows(RefreshFamilies)).toHaveLength(0);
    expect(h.rows(RefreshTokens)).toHaveLength(0);
  });

  it('rolls back user and profile creation if provider identity persistence fails', async () => {
    h.failure.identity = true;
    await expect(h.signIn()).rejects.toBeDefined();
    expect(h.em.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ google_user_id: principal().id }),
    );
    expect(h.rows(Users)).toHaveLength(0);
    expect(h.rows(Profiles)).toHaveLength(0);
    expect(h.rows(RefreshFamilies)).toHaveLength(0);
  });

  it('returns truthful provider and password fields through /me for a new OAuth account', async () => {
    await h.signIn();
    await expect(h.service.me(h.rows(Users)[0].id)).resolves.toMatchObject({
      email_verified: true,
      has_password: false,
      linked_providers: ['google'],
    });
  });

  it('allows refresh and logout-all through the same session system as password login', async () => {
    const session = await h.signIn();
    const rotated = await h.service.refresh({
      refresh_token: session.refresh_token,
    });
    expect(rotated.refresh_token).not.toBe(session.refresh_token);
    await h.service.logoutAll(h.rows(Users)[0].id);
    await rejects(
      h.service.refresh({ refresh_token: rotated.refresh_token }),
      401,
      'INVALID_REFRESH_TOKEN',
    );
  });
});

describe('Day 3 Google callback HTTP contract', () => {
  let app: INestApplication;
  const auth = { oauth: vi.fn(), login: vi.fn() };
  let denied = false;
  const response = {
    access_token: 'local-access',
    refresh_token: 'local-refresh',
    expires_in: 900,
    is_new_user: false,
  };
  beforeAll(async () => {
    Reflect.defineMetadata(
      'design:paramtypes',
      [AuthService, OAuthService],
      OAuthController,
    );
    const module = await Test.createTestingModule({
      controllers: [OAuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: OAuthService, useValue: auth },
      ],
    })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(GoogleAuthGuard)
      .useValue({
        canActivate(context: any) {
          if (denied)
            throw new UnauthorizedException({
              error: { code: 'OAUTH_INVALID' },
            });
          context.switchToHttp().getRequest().user = principal();
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => {
    denied = false;
    auth.oauth
      .mockReset()
      .mockResolvedValue({ id: 'local-user', is_new_user: false });
    auth.login.mockReset().mockResolvedValue(response);
  });
  afterAll(async () => {
    await app?.close();
  });

  it('guards both the authorization entry and callback with Google Passport', () => {
    for (const method of ['oauth', 'googleCallback'] as const) {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, OAuthController.prototype[method]),
      ).toContain(GoogleAuthGuard);
    }
  });
  it('returns the application login response to the callback consumer', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/auth/oauth/google/callback?code=test-code')
      .expect(200);
    expect(result.body).toEqual(response);
    expect(auth.oauth).toHaveBeenCalledTimes(1);
    expect(auth.oauth.mock.calls[0][0].user).toEqual(principal());
  });
  it('does not call account creation when Passport rejects the callback', async () => {
    denied = true;
    await request(app.getHttpServer())
      .get('/api/v1/auth/oauth/google/callback?error=access_denied')
      .expect(401);
    expect(auth.oauth).not.toHaveBeenCalled();
  });
  it('preserves LINK_REQUIRED for an email collision', async () => {
    auth.oauth.mockRejectedValueOnce(
      new HttpException({ error: { code: 'LINK_REQUIRED' } }, 409),
    );
    const result = await request(app.getHttpServer())
      .get('/api/v1/auth/oauth/google/callback')
      .expect(409);
    expect(result.body.error.code).toBe('LINK_REQUIRED');
  });
});
