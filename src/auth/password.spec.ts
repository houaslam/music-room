import { AuthService } from './auth.service.js';
import { UserService } from '../user/user.service.js';
import { Users } from '../user/entities/user.entity.js';
import { RefreshFamilies } from './entities/refresh-families.entity.js';
import { IsNull } from 'typeorm';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PasswordVerificationService } from './password-verification.service.js';
import { EmailTokens } from '../email/entities/email.entity.js';
import { EmailTypeEnum } from '../email/entities/email.enum.js';
import { AuthController } from './auth.controller.js';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService password change', () => {
  const email = 'person@example.com';
  const oldPassword = 'old-password';
  const newPassword = 'new-password';
  let service: AuthService;
  let user: Users;
  let manager: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let transaction: ReturnType<typeof vi.fn>;
  let hash: ReturnType<typeof vi.fn>;
  let verify: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    user = Object.assign(new Users(), {
      id: 'owner',
      email,
      password_hash: 'stored-hash',
      email_verified_at: new Date(),
      unlock_at: null,
    });
    manager = {
      findOne: vi.fn(async () => user),
      find: vi.fn(async () => []),
      update: vi.fn(async () => ({ affected: 1 })),
    };
    transaction = vi.fn(async (callback) => callback(manager));
    hash = vi.fn(async () => 'new-hash');
    verify = vi.fn(async () => true);
    service = new AuthService(
      new UserService({} as never),
      {} as never,
      { transaction } as never,
      { hash, verify } as never,
      {} as never,
    );
    // Ignore the dummy hash created by the constructor for login validation.
    hash.mockClear();
  });

  afterEach(() => vi.useRealTimers());

  const reset = () => service.changePassword(email, newPassword, oldPassword);
  const invalidCredentials = {
    status: 409,
    response: {
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials!' },
    },
  };

  it('verifies the old password and stores only the new hash', async () => {
    await expect(reset()).resolves.toBeUndefined();
    expect(verify).toHaveBeenCalledExactlyOnceWith(oldPassword, 'stored-hash');
    expect(hash).toHaveBeenCalledExactlyOnceWith(newPassword);
    expect(manager.update).toHaveBeenCalledWith(Users, user.id, {
      password_hash: 'new-hash',
    });
    expect(manager.findOne).toHaveBeenCalledWith(Users, {
      where: { email },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('locks and revokes live session families using the same transaction manager', async () => {
    await reset();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.find).toHaveBeenCalledWith(RefreshFamilies, {
      where: { user_id: user.id, revoked_at: IsNull() },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.update).toHaveBeenCalledWith(
      RefreshFamilies,
      { user_id: user.id, revoked_at: IsNull() },
      { revoked_at: new Date() },
    );
  });

  it.each(['missing', 'unverified', 'without-password'])(
    'rejects a %s account without hashing or updating anything',
    async (state) => {
      if (state === 'missing') manager.findOne.mockResolvedValue(null);
      if (state === 'unverified') user.email_verified_at = null;
      if (state === 'without-password') user.password_hash = null;
      await expect(reset()).rejects.toMatchObject(invalidCredentials);
      expect(verify).not.toHaveBeenCalled();
      expect(hash).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
      expect(manager.find).not.toHaveBeenCalled();
    },
  );

  it('rejects an incorrect old password without changing the password or sessions', async () => {
    verify.mockResolvedValue(false);
    await expect(reset()).rejects.toMatchObject(invalidCredentials);
    expect(hash).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.find).not.toHaveBeenCalled();
  });

  it('rejects an active account lock before checking the password', async () => {
    user.unlock_at = new Date(Date.now() + 1);
    await expect(reset()).rejects.toMatchObject({
      status: 429,
      response: { error: { code: 'ACCOUNT_LOCKED' } },
    });
    expect(verify).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it.each([0, -1000])(
    'allows a lock that expired %s ms from now',
    async (offset) => {
      user.unlock_at = new Date(Date.now() + offset);
      await expect(reset()).resolves.toBeUndefined();
      expect(manager.update).toHaveBeenCalledWith(Users, user.id, {
        password_hash: 'new-hash',
      });
    },
  );

  it('does not update the password or sessions if hashing fails', async () => {
    hash.mockRejectedValue(new Error('hash failed'));
    await expect(reset()).rejects.toThrow('hash failed');
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.find).not.toHaveBeenCalled();
  });

  it('propagates revocation failure out of the transaction so it can roll back', async () => {
    const failure = new Error('revocation failed');
    manager.update.mockImplementation(async (entity) => {
      if (entity === RefreshFamilies) throw failure;
      return { affected: 1 };
    });
    await expect(reset()).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
    await expect(transaction.mock.results[0].value).rejects.toBe(failure);
  });
});

const raw = '123456';
const digest = (value: string) =>
  `test-hash:${createHash('sha256').update(value).digest('hex')}`;
const now = new Date('2026-11-01T12:00:00Z');

describe('PasswordVerificationService', () => {
  let service: PasswordVerificationService;
  let state: { user: any; tokens: any[]; families: any[] };
  let manager: any;
  let mail: { sendEmail: ReturnType<typeof vi.fn> };
  let hasher: {
    hash: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
  };
  let failEntity: unknown;
  let transaction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    failEntity = null;
    const user = {
      id: 'owner',
      email: 'person@example.com',
      password_hash: 'old-hash',
      email_verified_at: now,
      unlock_at: new Date(now.getTime() + 10000),
      login_attemps: 5,
      failed_login_window_started_at: now,
    };
    state = {
      user,
      tokens: [
        {
          id: 'recovery',
          user,
          type: EmailTypeEnum.PASSWORD,
          token_hash: digest(raw),
          consumed_at: null,
          attempts: 0,
          is_sent: true,
          created_at: now,
          expires_at: new Date(now.getTime() + 300000),
        },
      ],
      families: [
        { id: 'one', user_id: 'owner', revoked_at: null },
        { id: 'two', user_id: 'owner', revoked_at: null },
        { id: 'revoked', user_id: 'owner', revoked_at: new Date(0) },
        { id: 'other', user_id: 'other-user', revoked_at: null },
      ],
    };
    const matches = (row: any, where: any): boolean =>
      Object.entries(where).every(([key, value]: [string, any]) => {
        if (value && value._type === 'isNull') return row[key] == null;
        if (value && typeof value === 'object') return matches(row[key], value);
        return row[key] === value;
      });
    const rows = (entity: unknown) =>
      entity === Users
        ? state.user
          ? [state.user]
          : []
        : entity === EmailTokens
          ? state.tokens
          : state.families;
    manager = {
      findOne: vi.fn(async (entity, options) => {
        const values = rows(entity).filter((row: any) =>
          matches(row, options.where),
        );
        return options.order ? (values.at(-1) ?? null) : (values[0] ?? null);
      }),
      find: vi.fn(async (entity, options) =>
        rows(entity).filter((row: any) => matches(row, options.where)),
      ),
      save: vi.fn(async (_entity, value) => {
        const token = {
          id: `token-${state.tokens.length}`,
          created_at: now,
          ...value,
        };
        state.tokens.push(token);
        return token;
      }),
      update: vi.fn(async (entity, criteria, changes) => {
        if (entity === failEntity) throw new Error('storage failed');
        const where =
          typeof criteria === 'string' ? { id: criteria } : criteria;
        const selected = rows(entity).filter((row: any) => matches(row, where));
        selected.forEach((row: any) => Object.assign(row, changes));
        return { affected: selected.length };
      }),
    };
    // Serialize and stage writes to model transaction commit/rollback. Real DB
    // lock semantics are outside this unit suite.
    let queue = Promise.resolve();
    transaction = vi.fn((work) => {
      const result = queue.then(async () => {
        const before = structuredClone(state);
        try {
          return await work(manager);
        } catch (error) {
          state = before;
          throw error;
        }
      });
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    });
    mail = { sendEmail: vi.fn(async () => undefined) };
    hasher = {
      hash: vi.fn(async (value) =>
        /^\d{6}$/.test(value) ? digest(value) : `hash:${value}`,
      ),
      verify: vi.fn(async (value, hash) => digest(value) === hash),
    };
    service = new PasswordVerificationService(
      { ...manager, transaction } as never,
      hasher as never,
      mail as never,
      new ConfigService({ OTP_LIFETIME_MS: 300000, MAX_TOKEN_ATTEMPTS: 5 }),
    );
  });

  afterEach(() => vi.useRealTimers());
  const confirm = () =>
    service.confirm({
      email: 'person@example.com',
      token: raw,
      new_password: 'new-password',
    });
  const error = (code: string) => ({
    status: 400,
    response: { error: { code } },
  });

  it('saves only the hash of the emailed token with expiry and single-use state', async () => {
    state.tokens = [];
    await expect(
      service.request('person@example.com'),
    ).resolves.toBeUndefined();
    const sent = mail.sendEmail.mock.calls[0][0] as any;
    const secret = sent.text.split(' ').at(-1);
    expect(secret).toMatch(/^\d{6}$/);
    expect(state.tokens[0]).toMatchObject({
      token_hash: digest(secret),
      consumed_at: null,
      is_sent: true,
      expires_at: new Date(now.getTime() + 300000),
      type: EmailTypeEnum.PASSWORD,
    });
    expect(JSON.stringify(state.tokens)).not.toContain(secret);
    expect(sent.recipients).toEqual(['person@example.com']);
    expect(hasher.hash).toHaveBeenCalledExactlyOnceWith(secret);
    await service.confirm({
      email: 'person@example.com',
      token: secret,
      new_password: 'replacement-password',
    });
    expect(state.user.password_hash).toBe('hash:replacement-password');
  });

  it.each(['missing', 'unverified', 'no-password'])(
    'returns no account information for %s accounts',
    async (kind) => {
      if (kind === 'missing') state.user = null;
      if (kind === 'unverified') state.user.email_verified_at = null;
      if (kind === 'no-password') state.user.password_hash = null;
      await expect(
        service.request('person@example.com'),
      ).resolves.toBeUndefined();
      expect(mail.sendEmail).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('suppresses resend while a sent token is active', async () => {
    await service.request('person@example.com');
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it('replaces an active legacy hex token instead of suppressing the OTP email', async () => {
    state.tokens[0].token_hash = 'a'.repeat(64);
    await service.request('person@example.com');
    expect(state.tokens[0].consumed_at).toEqual(now);
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    expect(state.tokens[1].is_sent).toBe(true);
    const sent = mail.sendEmail.mock.calls[0][0] as any;
    expect(sent.text.split(' ').at(-1)).toMatch(/^\d{6}$/);
  });

  it('preserves the generic request response when delivery fails and allows retry', async () => {
    state.tokens = [];
    mail.sendEmail.mockRejectedValueOnce(new Error('SMTP failed'));
    await expect(
      service.request('person@example.com'),
    ).resolves.toBeUndefined();
    expect(state.tokens[0].is_sent).toBe(false);
    await service.request('person@example.com');
    expect(state.tokens[0].consumed_at).toEqual(now);
    expect(state.tokens[1].is_sent).toBe(true);
  });

  it('preserves the generic response on storage failure without sending mail', async () => {
    state.tokens = [];
    failEntity = EmailTokens;
    await expect(
      service.request('person@example.com'),
    ).resolves.toBeUndefined();
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it('recovers a locked account, consumes its tokens and revokes only its live sessions', async () => {
    await confirm();
    expect(state.user).toMatchObject({
      password_hash: 'hash:new-password',
      login_attemps: 0,
      unlock_at: null,
      failed_login_window_started_at: null,
    });
    expect(state.tokens[0].consumed_at).toEqual(now);
    expect(state.families.map((family) => family.revoked_at)).toEqual([
      now,
      now,
      new Date(0),
      null,
    ]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.findOne).toHaveBeenCalledWith(Users, {
      where: { email: 'person@example.com' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.findOne).toHaveBeenCalledWith(EmailTokens, {
      where: {
        user: { id: 'owner' },
        type: EmailTypeEnum.PASSWORD,
      },
      order: { created_at: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(
      manager.findOne.mock.calls.filter(
        ([entity]: [unknown]) => entity === EmailTokens,
      ),
    ).toHaveLength(1);
  });

  it.each(['used', 'verification-token'])(
    'rejects %s tokens without mutations',
    async (kind) => {
      if (kind === 'used') state.tokens[0].consumed_at = now;
      if (kind === 'verification-token')
        state.tokens[0].type = EmailTypeEnum.VERIFY;
      await expect(confirm()).rejects.toMatchObject(error('TOKEN_INVALID'));
      expect(manager.update).not.toHaveBeenCalled();
      expect(hasher.hash).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1])(
    'rejects expiry at offset %s without mutations',
    async (offset) => {
      state.tokens[0].expires_at = new Date(now.getTime() + offset);
      await expect(confirm()).rejects.toMatchObject(error('TOKEN_EXPIRED'));
      expect(manager.update).not.toHaveBeenCalled();
    },
  );

  it('rejects expiry reached during password hashing', async () => {
    hasher.hash.mockImplementation(async () => {
      vi.setSystemTime(new Date(now.getTime() + 300000));
      return 'hash:new-password';
    });
    await expect(confirm()).rejects.toMatchObject(error('TOKEN_EXPIRED'));
    expect(state.tokens[0].consumed_at).toBeNull();
    expect(state.user.password_hash).toBe('old-hash');
  });

  it('counts incorrect OTP guesses persistently and stops at the configured limit', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(
        service.confirm({
          email: 'person@example.com',
          token: '000000',
          new_password: 'new-password',
        }),
      ).rejects.toMatchObject(error('TOKEN_INVALID'));
      expect(state.tokens[0].attempts).toBe(attempt);
    }
    await expect(confirm()).rejects.toMatchObject(
      error('TOKEN_ATTEMPTS_EXCEEDED'),
    );
    expect(hasher.verify).toHaveBeenCalledTimes(5);
    expect(state.user.password_hash).toBe('old-hash');
    expect(state.tokens[0].consumed_at).toBeNull();
  });

  it('does not accept a valid OTP for another email', async () => {
    await expect(
      service.confirm({
        email: 'other@example.com',
        token: raw,
        new_password: 'new-password',
      }),
    ).rejects.toMatchObject(error('TOKEN_INVALID'));
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it('rejects reuse after successful recovery', async () => {
    await confirm();
    await expect(confirm()).rejects.toMatchObject(error('TOKEN_INVALID'));
    expect(hasher.hash).toHaveBeenCalledTimes(1);
  });

  it('accepts only one of two concurrent confirmations', async () => {
    const results = await Promise.allSettled([confirm(), confirm()]);
    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(hasher.hash).toHaveBeenCalledTimes(1);
  });

  it.each([Users, RefreshFamilies])(
    'rolls back token consumption and password writes if a transaction write fails (%s)',
    async (entity) => {
      const before = structuredClone(state);
      failEntity = entity;
      await expect(confirm()).rejects.toThrow('storage failed');
      expect(state).toEqual(before);
      failEntity = null;
      await expect(confirm()).resolves.toBeUndefined();
      expect(state.tokens[0].consumed_at).toEqual(now);
    },
  );
});

describe('Password endpoints', () => {
  let controller: AuthController;
  const service = { changePassword: vi.fn() };
  const recovery = { request: vi.fn(), confirm: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    controller = new AuthController(service as never, recovery as never);
  });

  it('accepts recovery requests with an empty 202 response', async () => {
    await expect(
      controller.passwordResetRequest({ email: 'person@example.com' }),
    ).resolves.toBeUndefined();
    expect(recovery.request).toHaveBeenCalledExactlyOnceWith(
      'person@example.com',
    );
    expect(
      Reflect.getMetadata('__httpCode__', controller.passwordResetRequest),
    ).toBe(202);
    expect(Reflect.getMetadata('path', controller.passwordResetRequest)).toBe(
      'password-reset/request',
    );
  });

  it('confirms recovery using the token and new password with an empty 204 response', async () => {
    const payload = {
      email: 'person@example.com',
      token: '123456',
      new_password: 'new-password',
    };
    await expect(
      controller.passwordResetConfirm(payload),
    ).resolves.toBeUndefined();
    expect(recovery.confirm).toHaveBeenCalledExactlyOnceWith(payload);
    expect(
      Reflect.getMetadata('__httpCode__', controller.passwordResetConfirm),
    ).toBe(204);
    expect(Reflect.getMetadata('path', controller.passwordResetConfirm)).toBe(
      'password-reset/confirm',
    );
  });

  it('propagates recovery confirmation errors', async () => {
    const failure = new UnauthorizedException();
    recovery.confirm.mockRejectedValue(failure);
    await expect(
      controller.passwordResetConfirm({
        email: 'person@example.com',
        token: '123456',
        new_password: 'new-password',
      }),
    ).rejects.toBe(failure);
  });
});
