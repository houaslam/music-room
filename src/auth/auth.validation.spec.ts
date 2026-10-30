import { AuthService } from './auth.service.js';
import { Users } from '../user/entities/user.entity.js';

const windowMs = 15 * 60 * 1000;

describe('AuthService credential validation', () => {
  let service: AuthService;
  let user: Users;
  let read: ReturnType<typeof vi.fn>;
  let hash: ReturnType<typeof vi.fn>;
  let verify: ReturnType<typeof vi.fn>;
  let manager: {
    findOne: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
    user = Object.assign(new Users(), {
      id: 'user-id',
      email: 'user@example.com',
      password_hash: 'hash',
      email_verified_at: new Date(),
      login_attemps: 0,
      unlock_at: null,
      failed_login_window_started_at: null,
    });
    read = vi.fn(async () => ({ ...user }));
    hash = vi.fn(async () => 'dummy-password-hash');
    verify = vi.fn(async () => false);
    manager = {
      findOne: vi.fn(async () => ({ ...user })),
      update: vi.fn(async (_entity, _id, changes) => {
        Object.assign(user, changes);
        return { affected: 1 };
      }),
    };
    service = new AuthService(
      {} as never,
      {} as never,
      { read } as never,
      {
        transaction: async (callback: (value: typeof manager) => unknown) =>
          callback(manager),
      } as never,
      { hash, verify } as never,
      {} as never,
    );
  });

  afterEach(() => vi.useRealTimers());

  const credentials = { email: 'user@example.com', password: 'password' };

  it('rejects unknown users with generic credentials error', async () => {
    read.mockResolvedValue(null);
    await expect(service.validateUser(credentials)).rejects.toMatchObject({
      response: { error: { code: 'INVALID_CREDENTIALS' } },
    });
    expect(verify).toHaveBeenCalledExactlyOnceWith(
      credentials.password,
      'dummy-password-hash',
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('reuses the dummy hash and rejects unknown users even if comparison succeeds', async () => {
    read.mockResolvedValue(null);
    verify.mockResolvedValue(true);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(service.validateUser(credentials)).rejects.toMatchObject({
        status: 401,
        response: { error: { code: 'INVALID_CREDENTIALS' } },
      });
    }
    expect(hash).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenLastCalledWith(credentials.password, 'dummy-password-hash');
  });

  it('allows an unlocked account and clears failures on success', async () => {
    user.login_attemps = 4;
    user.failed_login_window_started_at = new Date();
    verify.mockResolvedValue(true);
    const result = await service.validateUser(credentials);
    expect(result).not.toHaveProperty('password_hash');
    expect(result).toMatchObject({
      login_attemps: 0,
      unlock_at: null,
      failed_login_window_started_at: null,
    });
    expect(user.login_attemps).toBe(0);
  });

  it('rejects an active lock before password verification', async () => {
    user.unlock_at = new Date(Date.now() + 1);
    await expect(service.validateUser(credentials)).rejects.toMatchObject({
      status: 429,
    });
    expect(verify).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('starts a window at the first failure without locking', async () => {
    await expect(service.validateUser(credentials)).rejects.toMatchObject({
      status: 401,
    });
    expect(user.login_attemps).toBe(1);
    expect(user.failed_login_window_started_at).toEqual(new Date());
    expect(user.unlock_at).toBeNull();
    expect(manager.findOne).toHaveBeenCalledWith(Users, {
      where: { id: user.id },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('locks on the fifth failure without moving the window start', async () => {
    user.login_attemps = 4;
    const start = new Date(Date.now() - 1000);
    user.failed_login_window_started_at = start;
    await expect(service.validateUser(credentials)).rejects.toMatchObject({
      status: 401,
    });
    expect(user.login_attemps).toBe(5);
    expect(user.failed_login_window_started_at).toEqual(start);
    expect(user.unlock_at).toEqual(new Date(Date.now() + windowMs));
  });

  it('starts over exactly when the counting window expires', async () => {
    user.login_attemps = 4;
    user.failed_login_window_started_at = new Date(Date.now() - windowMs);
    await expect(service.validateUser(credentials)).rejects.toMatchObject({
      status: 401,
    });
    expect(user.login_attemps).toBe(1);
    expect(user.failed_login_window_started_at).toEqual(new Date());
    expect(user.unlock_at).toBeNull();
  });

  it('counts a failure after lock expiry as attempt one', async () => {
    user.login_attemps = 5;
    user.unlock_at = new Date();
    user.failed_login_window_started_at = new Date(Date.now() - windowMs);
    await expect(service.validateUser(credentials)).rejects.toMatchObject({
      status: 401,
    });
    expect(user.login_attemps).toBe(1);
    expect(user.unlock_at).toBeNull();
  });

  it('uses the latest counter instead of the initial user snapshot', async () => {
    user.failed_login_window_started_at = new Date();
    read.mockResolvedValue({ ...user, login_attemps: 2 });
    user.login_attemps = 4;
    await expect(service.validateUser(credentials)).rejects.toMatchObject({
      status: 401,
    });
    expect(user.login_attemps).toBe(5);
  });

  it.each([true, false])(
    'honors a lock created during password verification (match: %s)',
    async (match) => {
      verify.mockImplementation(async () => {
        user.unlock_at = new Date(Date.now() + windowMs);
        return match;
      });
      await expect(service.validateUser(credentials)).rejects.toMatchObject({
        status: 429,
      });
      expect(manager.update).not.toHaveBeenCalled();
    },
  );

  it('checks email verification only after a correct password', async () => {
    user.email_verified_at = null;
    await expect(service.validateUser(credentials)).rejects.toMatchObject({
      status: 401,
    });
    manager.update.mockClear();
    verify.mockResolvedValue(true);
    await expect(service.validateUser(credentials)).rejects.toMatchObject({
      status: 403,
    });
    expect(manager.update).not.toHaveBeenCalled();
  });
});
