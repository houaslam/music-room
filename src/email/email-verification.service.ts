import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PasswordHasher } from '@nestjs/authentication';
import { EmailTokens } from './entities/email.entity.js';
import { EmailTypeEnum } from './entities/email.enum.js';
import { UserService } from '../user/user.service.js';
import { Users } from '../user/entities/user.entity.js';
import { EmailVerificationConfirmDTO } from '../auth/dto/email-verification-confirm.dto.js';
import { getMessage } from '../messages.js';
import type { MessageCode } from '../messages.js';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service.js';

@Injectable()
export class EmailVerificationService {
  constructor(
    @InjectRepository(EmailTokens)
    private readonly emailRepository: Repository<EmailTokens>,
    private readonly userService: UserService,
    private readonly passwordHasher: PasswordHasher,
    private readonly emailService: EmailService,
    private configService: ConfigService,
  ) {}

  async sendVerificationEmail(email: string): Promise<void> {
    const user = await this.userService.read({ email });
    if (!user || user.email_verified_at) return;

    const latestToken = await this.findLatestVerificationToken(user.id);
    if (
      latestToken?.is_sent &&
      !latestToken.consumed_at &&
      latestToken.expires_at.getTime() > Date.now()
    )
      return;

    const otp = randomInt(100000, 1000000).toString();
    const token = await this.createVerificationToken(user, otp);
    await this.emailService.sendEmail({
      recipients: [email],
      subject: getMessage('emailVerification', 'OTP_SUBJECT'),
      text: `${getMessage('emailVerification', 'OTP_BODY')} ${otp}`,
      html: `<p>${getMessage('emailVerification', 'OTP_BODY')} <strong>${otp}</strong></p>`,
    });

    await this.emailRepository.update({ id: token.id }, { is_sent: true });
  }

  async verifyToken(dto: EmailVerificationConfirmDTO): Promise<void> {
    const user = await this.userService.read({ email: dto.email });
    if (!user) throw this.tokenError('TOKEN_INVALID');

    const token = await this.findLatestVerificationToken(user.id);
    this.validateTokenState(token);
    await this.reserveAttempt(token.id);

    if (!(await this.passwordHasher.verify(dto.token, token.token_hash))) {
      throw this.tokenError('TOKEN_INVALID');
    }

    await this.consumeTokenAndVerifyUser(token.id, user.id);
  }

  private findLatestVerificationToken(
    userId: string,
  ): Promise<EmailTokens | null> {
    return this.emailRepository.findOne({
      where: { user: { id: userId }, type: EmailTypeEnum.VERIFY },
      order: { created_at: 'DESC' },
    });
  }

  private async createVerificationToken(
    user: Users,
    otp: string,
  ): Promise<EmailTokens> {
    const token = this.emailRepository.create({
      user,
      type: EmailTypeEnum.VERIFY,
      token_hash: await this.passwordHasher.hash(otp),
      expires_at: new Date(
        Date.now() + Number(this.configService.getOrThrow<number>('OTP_LIFETIME_MS')),
      ),
      is_sent: false,
    });
    return this.emailRepository.save(token);
  }

  private validateTokenState(
    token: EmailTokens | null,
  ): asserts token is EmailTokens {
    if (!token || token.consumed_at || !token.token_hash) {
      throw this.tokenError('TOKEN_INVALID');
    }
    if (token.expires_at.getTime() <= Date.now()) {
      throw this.tokenError('TOKEN_EXPIRED');
    }
  }

  private async reserveAttempt(tokenId: string): Promise<void> {
    const result = await this.emailRepository
      .createQueryBuilder()
      .update(EmailTokens)
      .set({ attempts: () => '"attempts" + 1' })
      .where('id = :id', { id: tokenId })
      .andWhere('"attempts" < :max', {
        max: Number(this.configService.getOrThrow<number>('MAX_TOKEN_ATTEMPTS')),
      })
      .andWhere('"consumed_at" IS NULL')
      .andWhere('"expires_at" > CURRENT_TIMESTAMP')
      .execute();

    if (result.affected !== 1) {
      const token = await this.emailRepository.findOne({
        where: { id: tokenId },
      });
      this.validateTokenState(token);
      throw this.tokenError('TOKEN_ATTEMPTS_EXCEEDED');
    }
  }

  private async consumeTokenAndVerifyUser(
    tokenId: string,
    userId: string,
  ): Promise<void> {
    await this.emailRepository.manager.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(EmailTokens)
        .set({ consumed_at: () => 'CURRENT_TIMESTAMP' })
        .where('id = :id', { id: tokenId })
        .andWhere('"consumed_at" IS NULL')
        .andWhere('"expires_at" > CURRENT_TIMESTAMP')
        .execute();

      if (result.affected !== 1) throw this.tokenError('TOKEN_INVALID');

      await manager.update(
        Users,
        { id: userId },
        { email_verified_at: new Date() },
      );
    });
  }

  private tokenError(
    code: Extract<MessageCode<'emailVerification'>, `TOKEN_${string}`>,
  ): BadRequestException {
    return new BadRequestException({
      error: { code, message: getMessage('emailVerification', code) },
    });
  }
}
