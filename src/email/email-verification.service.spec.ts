import { ConfigService } from '@nestjs/config';
import { PasswordHasher } from '@nestjs/authentication';
import { Repository } from 'typeorm';
import { EmailVerificationService } from './email-verification.service.js';
import { EmailService } from './email.service.js';
import { EmailTokens } from './entities/email.entity.js';
import { EmailTypeEnum } from './entities/email.enum.js';
import { UserService } from '../user/user.service.js';
import { Users } from '../user/entities/user.entity.js';

function updateQuery(affected = 1) {
  const query = {
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    execute: vi.fn().mockResolvedValue({ affected }),
  };
  for (const method of ['update', 'set', 'where', 'andWhere'] as const) {
    query[method].mockReturnValue(query);
  }
  return query;
}

describe('EmailVerificationService', () => {
  const user = {
    id: 'user-id',
    email: 'user@example.com',
    email_verified_at: null,
  } as Users;
  let token: EmailTokens;
  let service: EmailVerificationService;
  let attempts: ReturnType<typeof updateQuery>;
  let consumption: ReturnType<typeof updateQuery>;
  let repository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
    manager: { transaction: ReturnType<typeof vi.fn> };
  };
  let users: { read: ReturnType<typeof vi.fn> };
  let hasher: {
    hash: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
  };
  let mail: { sendEmail: ReturnType<typeof vi.fn> };
  let manager: {
    createQueryBuilder: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    token = {
      id: 'token-id',
      user,
      type: EmailTypeEnum.VERIFY,
      token_hash: 'hash',
      expires_at: new Date(Date.now() + 300000),
      consumed_at: null,
      is_sent: true,
      attempts: 0,
    } as EmailTokens;
    attempts = updateQuery();
    consumption = updateQuery();
    manager = {
      createQueryBuilder: vi.fn(() => consumption),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    repository = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((value) => value),
      save: vi.fn().mockResolvedValue(token),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: vi.fn(() => attempts),
      manager: { transaction: vi.fn(async (work) => work(manager)) },
    };
    users = { read: vi.fn().mockResolvedValue(user) };
    hasher = {
      hash: vi.fn().mockResolvedValue('hash'),
      verify: vi.fn().mockResolvedValue(true),
    };
    mail = { sendEmail: vi.fn().mockResolvedValue(undefined) };
    service = new EmailVerificationService(
      repository as unknown as Repository<EmailTokens>,
      users as unknown as UserService,
      hasher as unknown as PasswordHasher,
      mail as unknown as EmailService,
      new ConfigService({ OTP_LIFETIME_MS: '300000', MAX_TOKEN_ATTEMPTS: '5' }),
    );
  });

  it('saves before delivery, marks delivery afterward, and returns no OTP', async () => {
    const result = await service.sendVerificationEmail(user.email!);
    expect(result).toBeUndefined();
    expect(repository.save.mock.invocationCallOrder[0]).toBeLessThan(
      mail.sendEmail.mock.invocationCallOrder[0],
    );
    expect(mail.sendEmail.mock.invocationCallOrder[0]).toBeLessThan(
      repository.update.mock.invocationCallOrder[0],
    );
    const otp = hasher.hash.mock.calls[0][0];
    expect(otp).toMatch(/^\d{6}$/);
    expect(mail.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ text: `Your OTP is ${otp}` }),
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ is_sent: false }),
    );
  });

  it('does not send if saving the token fails', async () => {
    repository.save.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.sendVerificationEmail(user.email!)).rejects.toThrow(
      'Database unavailable',
    );
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it('leaves failed delivery pending and allows a replacement on the next request', async () => {
    token.is_sent = false;
    repository.findOne.mockResolvedValue(token);
    mail.sendEmail.mockRejectedValueOnce(new Error('SMTP unavailable'));
    await expect(service.sendVerificationEmail(user.email!)).rejects.toThrow(
      'SMTP unavailable',
    );
    expect(repository.update).not.toHaveBeenCalled();
    await service.sendVerificationEmail(user.email!);
    expect(mail.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('suppresses resend while a sent code is active', async () => {
    repository.findOne.mockResolvedValue(token);
    await service.sendVerificationEmail(user.email!);
    expect(repository.save).not.toHaveBeenCalled();
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it.each([null, { ...user, email_verified_at: new Date() }])(
    'accepts resend without sending for an ineligible account',
    async (account) => {
      users.read.mockResolvedValue(account);
      await expect(
        service.sendVerificationEmail(user.email!),
      ).resolves.toBeUndefined();
      expect(mail.sendEmail).not.toHaveBeenCalled();
    },
  );

  it('verifies a delivered code even when recording delivery failed', async () => {
    token.is_sent = false;
    repository.findOne.mockResolvedValue(token);
    await service.verifyToken({ email: user.email!, token: '123456' });
    expect(hasher.verify).toHaveBeenCalledWith('123456', 'hash');
    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(
      Users,
      { id: user.id },
      { email_verified_at: expect.any(Date) },
    );
  });

  it('counts an incorrect guess without consuming the token or verifying the user', async () => {
    repository.findOne.mockResolvedValue(token);
    hasher.verify.mockResolvedValue(false);
    await expect(
      service.verifyToken({ email: user.email!, token: '000000' }),
    ).rejects.toMatchObject({ response: { error: { code: 'TOKEN_INVALID' } } });
    expect(attempts.execute).toHaveBeenCalled();
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });

  it('rejects expired codes before reserving an attempt', async () => {
    token.expires_at = new Date(Date.now() - 1);
    repository.findOne.mockResolvedValue(token);
    await expect(
      service.verifyToken({ email: user.email!, token: '123456' }),
    ).rejects.toMatchObject({ response: { error: { code: 'TOKEN_EXPIRED' } } });
    expect(attempts.execute).not.toHaveBeenCalled();
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it('stops exhausted attempts before comparing the OTP', async () => {
    repository.findOne.mockResolvedValue(token);
    attempts.execute.mockResolvedValue({ affected: 0 });
    await expect(
      service.verifyToken({ email: user.email!, token: '123456' }),
    ).rejects.toMatchObject({
      response: { error: { code: 'TOKEN_ATTEMPTS_EXCEEDED' } },
    });
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it('rejects a code consumed by another request before updating the user', async () => {
    repository.findOne.mockResolvedValue(token);
    consumption.execute.mockResolvedValue({ affected: 0 });
    await expect(
      service.verifyToken({ email: user.email!, token: '123456' }),
    ).rejects.toMatchObject({ response: { error: { code: 'TOKEN_INVALID' } } });
    expect(manager.update).not.toHaveBeenCalled();
  });
});
