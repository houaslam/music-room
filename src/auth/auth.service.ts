import { getMessage } from '../messages.js';
import {
  Body,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service.js';
import { PasswordHasher } from '@nestjs/authentication';
import { RegisterPayloadDTO } from './dto/register.dto.js';
import { EmailVerificationDTO } from './dto/email-verification.dto.js';
import { EmailVerificationConfirmDTO } from './dto/email-verification-confirm.dto.js';
import { DeletePayloadDTO } from './dto/delete.dto.js';
import { LoginPaylodDTO } from './dto/login.dto.js';
import refreshJwtConfig from './config/refresh-jwt.config.js';
import type { ConfigType } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Users } from '../user/entities/user.entity.js';
import { Profiles } from '../profile/entities/profiles.entity.js';
import { EmailVerificationService } from '../email/email-verification.service.js';
@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    @Inject(refreshJwtConfig.KEY)
    private refreshTokenConfig: ConfigType<typeof refreshJwtConfig>,
    private userService: UserService,
    @InjectEntityManager()
    private entityManager: EntityManager,
    private readonly passwordHasher: PasswordHasher,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async validateUser({ email, password }: LoginPaylodDTO) {
    const findUser = await this.userService.read({ email });
    if (!findUser) {
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: getMessage('auth', 'INVALID_CREDENTIALS'),
        },
      });
    }

    const isMatch = await this.passwordHasher.verify(
      password,
      findUser.password_hash,
    );
    if (findUser.is_locked) {
      throw new HttpException(
        {
          error: {
            code: 'ACCOUNT_LOCKED',
            message: getMessage('auth', 'ACCOUNT_LOCKED'),
          },
        },
        429,
      );
    }
    if (!isMatch) {
      await this.userService.update({
        id: findUser.id,
        changes: {
          login_attemps: findUser.login_attemps + 1,
          is_locked: findUser.login_attemps + 1 >= 3,
          unlock_at: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: getMessage('auth', 'INVALID_CREDENTIALS'),
        },
      });
    }
    if (!findUser.email_verified_at) {
      throw new ForbiddenException({
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: getMessage('auth', 'EMAIL_NOT_VERIFIED'),
        },
      });
    }
    const { password_hash, ...user } = findUser;
    return user;
  }

  async login(user: any) {
    const payload = { sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      expires_in: Math.floor((Date.now() + 15 * 60 * 1000) / 1000),
      refresh_token: this.jwtService.sign(payload, this.refreshTokenConfig),
    };
  }

  async userSaveTransaction(userPayload: any) {
    return await this.entityManager.transaction(async (manager) => {
      try {
        const savedUser = await manager.save(Users, userPayload);
        await manager.save(Profiles, {
          user_id: savedUser.id,
          display_name: savedUser.display_name,
        });
        return savedUser;
      } catch (error: any) {
        const errorCode = error.code || error.errno;
        const isDuplicate = errorCode === '23505' || errorCode === 1062;

        if (isDuplicate) {
          throw new ConflictException({
            error: {
              code: 'EMAIL_TAKEN',
              message: getMessage('auth', 'EMAIL_TAKEN'),
            },
          });
        }

        throw new InternalServerErrorException({
          error: {
            code: 'INTERNAL_ERROR',
            message: getMessage('auth', 'INTERNAL_ERROR'),
          },
        });
      }
    });
  }

  async register(@Body() req: RegisterPayloadDTO) {
    const password_hash = await this.passwordHasher.hash(req.password);
    const user = await this.userSaveTransaction({
      email: req.email,
      password_hash,
      display_name: req.display_name,
    });

    try {
      await this.emailVerification({ email: req.email });
    } catch (error) {
      console.log(getMessage('auth', 'EMAIL_DELIVERY_FAILED'), error);
    }
    return { user_id: user.id };
  }

  async emailVerification(@Body() dto: EmailVerificationDTO) {
    await this.emailVerificationService.sendVerificationEmail(dto.email);
  }

  async emailVerificationConfirm(@Body() dto: EmailVerificationConfirmDTO) {
    await this.emailVerificationService.verifyToken(dto);
  }

  async delete(@Body() req: DeletePayloadDTO) {
    const deleteUser = await this.userService.delete(req);
    const isDeleted = deleteUser.affected === 1;

    if (isDeleted) return { message: getMessage('auth', 'USER_DELETED') };

    throw new HttpException(
      {
        error: {
          message: getMessage('auth', 'DATA_CONFLICT'),
          code: 'DATA_CONFLICT',
        },
      },
      409,
    );
  }
}
