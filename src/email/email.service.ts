import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { SendEmailDTO } from './dto/send-email.dto.js';
import { randomInt } from 'crypto';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { EmailTokens } from './entity/email.entity.js';
import { UserService } from '../user/user.service.js';
import { EmailTypeEnum } from './entity/email.enum.js';
import * as bcrypt from 'bcrypt';
import { use } from 'passport';
import { Users } from '../user/entity/user.entity.js';
import { EmailVerificationConfirmDTO } from '../auth/dto/email-verification-confirm.dto.js';

@Injectable()
export class EmailService {
  private saltOrRounds: number = 10;

  constructor(
    private configService: ConfigService,
    @InjectRepository(EmailTokens)
    private readonly emailRepository: Repository<EmailTokens>,
    private readonly userService: UserService,
  ) {}

  emailTransport() {
    const transporter = nodemailer.createTransport({
      host: this.configService.get<string>('EMAIL_HOST'),
      port: Number(this.configService.getOrThrow<string>('EMAIL_PORT')),
      secure: false,
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASSWORD'),
      },
    });
    return transporter;
  }

  private async reserveAttempt(tokenId: string) {
    const result = await this.emailRepository
      .createQueryBuilder()
      .update(EmailTokens)
      .set({ attempts: () => '"attempts" + 1' })
      .where('id = :id', { id: tokenId })
      .andWhere('"attempts" < :max', { max: 5 })
      .andWhere('"consumed_at" IS NULL')
      .andWhere('"expires_at" > CURRENT_TIMESTAMP')
      .execute();
    if (result.affected !== 1) {
      throw new BadRequestException(
        'Token unavailable or attempt limit reached',
      );
    }
  }

  async sendEmail(dto: SendEmailDTO) {
    const { recipients, subject, html } = dto;
    const transporter = this.emailTransport();
    const options: nodemailer.SendMailOptions = {
      from: this.configService.get<string>('EMAIL_USER'),
      to: recipients,
      subject: subject,
      html: html,
    };

    await transporter.sendMail(options);
    console.log('Email successfully sent');
  }

  private generateOtp(): string {
    const otp = randomInt(100000, 999999).toString();
    return otp;
  }

  async verifyToken(dto: EmailVerificationConfirmDTO) {
    const user = await this.userService.read({ email: dto.email });
    if (!user)
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'No user with THIS email',
      });
    const currToken = await this.read(user);
    if (!currToken)
      throw new BadRequestException({
        code: 'TOKEN_INVALID',
        message: 'Invalid Token',
      });
    await this.reserveAttempt(currToken.id);
    await this.validateToken(currToken, dto.token);
    await this.update(currToken!);
    await this.userService.update({
      id: user.id,
      changes: {
        email_verified_at: new Date(),
      },
    });
  }

  async create(user: Users, token: string) {
    const email_token = this.emailRepository.create({
      user: user,
      type: EmailTypeEnum.VERIFY,
      token_hash: await bcrypt.hash(token, this.saltOrRounds),
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
    });

    await this.emailRepository.save(email_token);
  }

  async read(user: Users): Promise<EmailTokens | null> {
    const emailToken = await this.emailRepository.findOne({
      where: { user: { id: user.id }, type: EmailTypeEnum.VERIFY },
      order: { created_at: 'DESC' },
    });
    return emailToken;
  }

  async update(token: EmailTokens) {
    await this.emailRepository.update(
      { id: token.id },
      {
        consumed_at: new Date(Date.now()),
      },
    );
  }

  async validateToken(
    token: EmailTokens | null,
    reqToken: string,
  ): Promise<boolean> {
    if (!token)
      throw new BadRequestException({
        code: 'TOKEN_INVALID',
        message: 'Invalid Token',
      });
    if (token.consumed_at)
      throw new BadRequestException({
        code: 'TOKEN_EXPIRED',
        message: 'Token is already used',
      });
    if (token.expires_at <= new Date(Date.now()))
      throw new BadRequestException({
        code: 'TOKEN_EXPIRED',
        message: 'Token is expired',
      });

    const tokenHash = token.token_hash;
    if (!tokenHash)
      throw new BadRequestException({
        code: 'TOKEN_INVALID',
        message: 'Invalid Token',
      });
    const isMatch = await bcrypt.compare(reqToken, tokenHash);
    if (!isMatch)
      throw new BadRequestException({
        code: 'TOKEN_INVALID',
        message: 'Invalid Token',
      });
    return true;
  }

  async sendOtpToEmail(email: string): Promise<string> {
    const user = await this.userService.read({ email });
    if (!user)
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'No User with such email',
      });
    if (user.email_verified_at)
      throw new ConflictException({
        code: 'EMAIL_VERIFIED',
        message: 'Email is already verified',
      });
    const findToken = await this.read(user);
    if (
      findToken &&
      findToken.type == EmailTypeEnum.VERIFY &&
      !findToken.consumed_at &&
      findToken.expires_at > new Date(Date.now())
    )
      throw new ConflictException({
        code: 'TOKEN_SENT',
        message: 'Token is already sent, retry in 5 mins',
      });

    const otp = this.generateOtp();
    
    try {
      const transporter = this.emailTransport();
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your OTP Code',
        text: `Your OTP is ${otp}`,
        html: `<p>Your OTP is <strong>${otp}</strong></p>`,
      });
      
      await this.create(user, otp);
      return otp;
    } catch (error) {
      console.error('Error sending OTP via email', error);
      throw new Error('Failed to send OTP via email');
    }
  }
}
