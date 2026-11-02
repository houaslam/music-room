import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { ConfigService } from '@nestjs/config';
import { InjectEntityManager } from '@nestjs/typeorm';
import { randomInt } from 'node:crypto';
import { EntityManager, IsNull } from 'typeorm';
import { EmailService } from '../email/email.service.js';
import { EmailTokens } from '../email/entities/email.entity.js';
import { EmailTypeEnum } from '../email/entities/email.enum.js';
import { Users } from '../user/entities/user.entity.js';
import { RefreshFamilies } from './entities/refresh-families.entity.js';
import { PasswordResetConfirmPayloadDTO } from './dto/password-reset-confirm.dto.js';
import { getMessage } from '../messages.js';

@Injectable()
export class PasswordVerificationService {
  private readonly logger = new Logger(PasswordVerificationService.name);

  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly hasher: PasswordHasher,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async request(email: string): Promise<void> {
    try {
      const raw = randomInt(100000, 1000000).toString();
      const lifetime = Number(
        this.config.getOrThrow<number>('OTP_LIFETIME_MS'),
      );
      if (!Number.isFinite(lifetime) || lifetime <= 0) {
        throw new Error('Invalid recovery token lifetime');
      }
      const token = await this.manager.transaction(async (manager) => {
        const user = await manager.findOne(Users, {
          where: { email },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user?.password_hash || !user.email_verified_at) return null;
        const active = await manager.findOne(EmailTokens, {
          where: { user: { id: user.id }, type: EmailTypeEnum.PASSWORD },
          order: { created_at: 'DESC' },
        });
        if (
          active?.is_sent &&
          // Tokens from the previous hex-token flow cannot verify a six-digit OTP.
          !/^[a-f0-9]{64}$/.test(active.token_hash) &&
          !active.consumed_at &&
          active.expires_at.getTime() > Date.now()
        ) {
          return null;
        }
        await manager.update(
          EmailTokens,
          {
            user: { id: user.id },
            type: EmailTypeEnum.PASSWORD,
            consumed_at: IsNull(),
          },
          { consumed_at: new Date() },
        );
        return manager.save(EmailTokens, {
          user,
          type: EmailTypeEnum.PASSWORD,
          token_hash: await this.hasher.hash(raw),
          attempts: 0,
          expires_at: new Date(Date.now() + lifetime),
          consumed_at: null,
          is_sent: false,
        });
      });
      if (!token) return;
      await this.emailService.sendEmail({
        recipients: [token.user.email!],
        subject: getMessage('passwordReset', 'SUBJECT'),
        text: `${getMessage('passwordReset', 'BODY')} ${raw}`,
        html: `<p>${getMessage('passwordReset', 'BODY')} <strong>${raw}</strong></p>`,
      });
      await this.manager.update(EmailTokens, token.id, { is_sent: true });
    } catch {
      this.logger.error('Password recovery request could not be completed');
    }
  }

  async confirm(dto: PasswordResetConfirmPayloadDTO): Promise<void> {
    const failure = await this.manager.transaction(async (manager) => {
      const user = await manager.findOne(Users, {
        where: { email: dto.email },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user?.password_hash || !user.email_verified_at)
        throw this.tokenError('TOKEN_INVALID');
      const token = await manager.findOne(EmailTokens, {
        where: {
          user: { id: user.id },
          type: EmailTypeEnum.PASSWORD,
        },
        order: { created_at: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !token ||
        token.consumed_at ||
        !token.token_hash ||
        /^[a-f0-9]{64}$/.test(token.token_hash)
      )
        throw this.tokenError('TOKEN_INVALID');
      if (token.expires_at.getTime() <= Date.now())
        throw this.tokenError('TOKEN_EXPIRED');
      const maxAttempts = Number(
        this.config.getOrThrow<number>('MAX_TOKEN_ATTEMPTS'),
      );
      if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
        throw new Error('Invalid recovery token attempt limit');
      }
      if (token.attempts >= maxAttempts)
        throw this.tokenError('TOKEN_ATTEMPTS_EXCEEDED');
      await manager.update(EmailTokens, token.id, {
        attempts: token.attempts + 1,
      });
      if (!(await this.hasher.verify(dto.token, token.token_hash))) {
        // Commit the failed attempt before returning the validation error.
        return 'TOKEN_INVALID' as const;
      }
      const passwordHash = await this.hasher.hash(dto.new_password);
      if (token.expires_at.getTime() <= Date.now())
        throw this.tokenError('TOKEN_EXPIRED');
      await manager.update(
        EmailTokens,
        {
          user: { id: user.id },
          type: EmailTypeEnum.PASSWORD,
          consumed_at: IsNull(),
        },
        { consumed_at: new Date() },
      );
      await manager.update(Users, user.id, {
        password_hash: passwordHash,
        login_attemps: 0,
        unlock_at: null,
        failed_login_window_started_at: null,
      });
      await manager.find(RefreshFamilies, {
        where: { user_id: user.id, revoked_at: IsNull() },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      await manager.update(
        RefreshFamilies,
        {
          user_id: user.id,
          revoked_at: IsNull(),
        },
        { revoked_at: new Date() },
      );
    });
    if (failure) throw this.tokenError(failure);
  }

  private tokenError(
    code: 'TOKEN_INVALID' | 'TOKEN_EXPIRED' | 'TOKEN_ATTEMPTS_EXCEEDED',
  ) {
    return new BadRequestException({
      error: { code, message: getMessage('passwordReset', code) },
    });
  }
}
