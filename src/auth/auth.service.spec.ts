import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AuthService } from './auth.service.js';
import { RefreshTokens } from './entities/refresh-tokens.entity.js';
import { RefreshFamilies } from './entities/refresh-families.entity.js';

const userId = '7c289d4c-ab51-4ed5-bbd0-d02fb59bc01a';
const device = {
  platform: 'ios',
  deviceModel: 'phone',
  appVersion: '1.0.0',
  deviceId: '7c289d4c-ab51-4ed5-bbd0-d02fb59bc01b',
};
const jwt = new JwtService({
  secret: 'test-access',
  signOptions: { expiresIn: '1h' },
});
const config = { secret: 'test-refresh', expiresIn: '7d' as const };

describe('AuthService session families', () => {
  let service: AuthService;
  let families: RefreshFamilies[];
  let tokens: RefreshTokens[];
  let manager: { save: any; insert: any; findOne: any; update: any };

  beforeEach(() => {
    families = [];
    tokens = [];
    const rows = (entity: unknown) =>
      entity === RefreshTokens ? tokens : families;
    manager = {
      save: vi.fn(async (entity, values) => {
        const row = { id: randomUUID(), ...values };
        rows(entity).push(row);
        return row;
      }),
      insert: vi.fn(async (entity, values) => {
        rows(entity).push({ id: randomUUID(), ...values });
      }),
      findOne: vi.fn(async (entity, { where }) => {
        const row = rows(entity).find((item: any) =>
          Object.entries(where).every(([key, value]) => item[key] === value),
        );
        return row ? { ...row } : null;
      }),
      update: vi.fn(async (entity, id, changes) => {
        const row = rows(entity).find((item) => item.id === id);
        if (row) Object.assign(row, changes);
        return { affected: row ? 1 : 0 };
      }),
    };
    const entityManager = {
      transaction: async (callback: (manager: unknown) => Promise<unknown>) => {
        const before = structuredClone({ families, tokens });
        try {
          return await callback(manager);
        } catch (error) {
          families = before.families;
          tokens = before.tokens;
          throw error;
        }
      },
    };
    service = new AuthService(
      jwt,
      config,
      {} as never,
      entityManager as never,
      {
        hash: vi.fn(async (raw) => `hash:${raw}`),
        verify: vi.fn(async (raw, hash) => hash === `hash:${raw}`),
      } as never,
      {} as never,
    );
  });

  const login = (service: AuthService, deviceId = device.deviceId) =>
    service.login({ id: userId }, { ...device, deviceId });
  const rejected = (promise: Promise<unknown>) =>
    expect(promise).rejects.toMatchObject({
      status: 401,
      response: { error: { code: 'INVALID_REFRESH_TOKEN' } },
    });

  it('persists the JWT ID, hash, device and expiry without exposing internal fields', async () => {
    const result = await login(service);
    const payload = await jwt.verifyAsync(result.refresh_token, config);
    expect(Object.keys(result).sort()).toEqual([
      'access_token',
      'expires_in',
      'refresh_token',
    ]);
    expect(result.expires_in).toBe(3600);
    expect(tokens[0]).toMatchObject({
      jti: payload.jti,
      family_id: families[0].id,
      device_id: device.deviceId,
      token_hash: `hash:${result.refresh_token}`,
      used_at: null,
      revoked_at: null,
      expires_at: new Date(payload.exp * 1000),
    });
  });

  it('creates separate families for devices and repeated logins on the same device', async () => {
    await login(service);
    await login(service, randomUUID());
    await login(service);
    expect(new Set(families.map((row) => row.id)).size).toBe(3);
    expect(tokens).toHaveLength(3);
    expect(families[0].device_id).toBe(families[2].device_id);
  });

  it('retains old token history and revokes only its family on reuse', async () => {
    const first = await login(service);
    const other = await login(service, randomUUID());
    const next = await service.refresh({ refresh_token: first.refresh_token });
    expect(tokens).toHaveLength(3);
    expect(tokens[0].used_at).toBeInstanceOf(Date);
    expect(tokens[2].family_id).toBe(tokens[0].family_id);
    expect(tokens[2].jti).not.toBe(tokens[0].jti);
    await rejected(service.refresh({ refresh_token: first.refresh_token }));
    expect(families[0].revoked_at).toBeInstanceOf(Date);
    await rejected(service.refresh({ refresh_token: next.refresh_token }));
    await expect(
      service.refresh({ refresh_token: other.refresh_token }),
    ).resolves.toBeDefined();
  });

  it('acquires a family write lock during rotation', async () => {
    const first = await login(service);
    await service.refresh({ refresh_token: first.refresh_token });
    expect(manager.findOne).toHaveBeenCalledWith(RefreshFamilies, {
      where: { id: families[0].id, user_id: userId },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it.each([
    'missing',
    'expired',
    'revoked',
    'mismatch',
    'family-revoked',
    'wrong-owner',
  ])('rejects %s storage without issuing another token', async (state) => {
    const first = await login(service);
    if (state === 'missing') tokens = [];
    if (state === 'expired') tokens[0].expires_at = new Date(0);
    if (state === 'revoked') tokens[0].revoked_at = new Date();
    if (state === 'mismatch') tokens[0].token_hash = 'wrong';
    if (state === 'family-revoked') families[0].revoked_at = new Date();
    if (state === 'wrong-owner') families[0].user_id = randomUUID();
    manager.insert.mockClear();
    await rejected(service.refresh({ refresh_token: first.refresh_token }));
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('rejects invalid signatures, expired JWTs and malformed/missing claims', async () => {
    const malformed = [
      'invalid',
      await jwt.signAsync(
        { sub: userId, jti: randomUUID() },
        { secret: config.secret, expiresIn: -1 },
      ),
      await jwt.signAsync({ sub: userId, jti: randomUUID() }),
      await jwt.signAsync({ sub: userId }, config),
      await jwt.signAsync({ sub: 'invalid-id', jti: randomUUID() }, config),
      await jwt.signAsync({ sub: userId, jti: 'invalid-id' }, config),
      await new JwtService({ secret: config.secret }).signAsync({
        sub: userId,
        jti: randomUUID(),
      }),
    ];
    for (const raw of malformed)
      await rejected(service.refresh({ refresh_token: raw }));
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('rolls back rotation if storing the replacement fails', async () => {
    const first = await login(service);
    manager.insert.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(
      service.refresh({ refresh_token: first.refresh_token }),
    ).rejects.toThrow('storage unavailable');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].used_at).toBeNull();
    await expect(
      service.refresh({ refresh_token: first.refresh_token }),
    ).resolves.toBeDefined();
  });

  it('rolls back family creation if the initial token cannot be stored', async () => {
    manager.insert.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(login(service)).rejects.toThrow('storage unavailable');
    expect(families).toHaveLength(0);
  });

  it('logout accepts a rotated token, is idempotent and preserves other sessions', async () => {
    const first = await login(service);
    const other = await login(service, randomUUID());
    const current = await service.refresh({
      refresh_token: first.refresh_token,
    });
    await expect(service.logout(first.refresh_token)).resolves.toBeUndefined();
    const revokedAt = families[0].revoked_at;
    await service.logout(first.refresh_token);
    expect(families[0].revoked_at).toEqual(revokedAt);
    await rejected(service.refresh({ refresh_token: current.refresh_token }));
    await expect(
      service.refresh({ refresh_token: other.refresh_token }),
    ).resolves.toBeDefined();
  });

  it('logout ignores unknown and mismatched tokens without revoking another family', async () => {
    const first = await login(service);
    await service.logout('invalid');
    await service.logout(
      await jwt.signAsync({ sub: userId, jti: randomUUID() }, config),
    );
    tokens[0].token_hash = 'wrong';
    await service.logout(first.refresh_token);
    expect(families[0].revoked_at).toBeNull();
  });
});
