import {
  Body,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthPayloadDTO } from './dto/auth.dto.js';
import { UserService } from '../user/user.service.js';
import * as bcrypt from 'bcrypt';
import { RegisterPayloadDTO } from './dto/register.dto.js';
import { EmailVerificationDTO } from './dto/email-verification.dto.js';
import { EmailService } from '../email/email.service.js';
import { EmailVerificationConfirmDTO } from './dto/email-verification-confirm.dto.js';
import { DeletePayloadDTO } from './dto/delete.dto.js';
import { LoginPaylodDTO } from './dto/login.dto.js';
import refreshJwtConfig from './config/refresh-jwt.config.js';
import type { ConfigType } from '@nestjs/config';
@Injectable()
export class AuthService {
  private saltOrRounds: number = 10;

  constructor(
    private jwtService: JwtService,
    @Inject(refreshJwtConfig.KEY) private refreshTokenConfig: ConfigType<typeof refreshJwtConfig>,
    private userService: UserService,
    private emailService: EmailService,
  ) {}

  async validateUser({ email, password }: LoginPaylodDTO) {
    const findUser = await this.userService.read({ email });
    if (!findUser) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials!',
      });
    }

    const isMatch = await bcrypt.compare(password, findUser.password_hash);
    if (findUser.is_locked) {
      throw new HttpException(
        { code: 'ACCOUNT_LOCKED', message: 'Account is locked, retry in 5 mins!' },
        429,
      );
    }
    if (!isMatch) {
      await this.userService.update({
        id: findUser.id,
        changes: {
          login_attemps: findUser.login_attemps + 1,
          is_locked: findUser.login_attemps + 1 >= 3,
          unlock_at: new Date(Date.now() + 15 * 60 * 1000 )
        },
      });
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials!',
      });
    }
    if (!findUser.email_verified_at) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email is not verified!',
      });
    }
    const { password_hash, ...user } = findUser;
    return user;
  }

  async login(email: string) {
    const payload = { email };
    return {
      access_token: this.jwtService.sign(payload),
      expires_in: Math.floor((Date.now() + 15 * 60 * 1000) / 1000),
      refresh_token:this.jwtService.sign(payload, this.refreshTokenConfig)
    };
  }

  async register(@Body() req: RegisterPayloadDTO) {
    const password_hash = await bcrypt.hash(req.password, this.saltOrRounds);
    const newUser = {
      email: req.email,
      password_hash,
      display_name: req.display_name,
    };
    const createdUser = await this.userService.create(newUser);
    await this.emailVerification({ email: req.email });
    return { user_id: createdUser.id };
  }

  async emailVerification(@Body() dto: EmailVerificationDTO) {
    await this.emailService.sendOtpToEmail(dto.email);
    return { messgae: 'Email sent Successfuly' };
  }

  async emailVerificationConfirm(@Body() dto: EmailVerificationConfirmDTO) {
    await this.emailService.verifyToken(dto);
    return { messgae: 'Email is verified Successfuly' };
  }

  async delete(@Body() req: DeletePayloadDTO) {
    const deleteUser = await this.userService.delete(req);
    const isDeleted = deleteUser.affected === 1;

    if (isDeleted) return { message: 'User Deleted Successfully' };

    throw new HttpException(
      { message: 'User Deletion was unsuccessfull', code: 'DATA_CONFLICT' },
      409,
    );
  }
}
