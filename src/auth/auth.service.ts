import { getMessage } from '../messages.js';
import {
  Body,
  ConflictException,
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
import { EntityManager, IsNull } from 'typeorm';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Users } from '../user/entities/user.entity.js';
import { Profiles } from '../profile/entities/profiles.entity.js';
import { EmailVerificationService } from '../email/email-verification.service.js';
import { RefreshPlayloadDTO } from './dto/refresh.dto.js';
import { RefreshTokens } from './entities/refresh-tokens.entity.js';
import { randomUUID } from 'node:crypto';
import { DeviceHeadersDto } from './dto/headers-validation.dto.js';
import { RefreshFamilies } from './entities/refresh-families.entity.js';
import { RefreshTokenService } from './refresh-tokens.service.js';

@Injectable()
export class AuthService {
  private dummy_password_hash: Promise<string>;
  constructor(
    private jwtService: JwtService,
    @Inject(refreshJwtConfig.KEY)
    private refreshTokenConfig: ConfigType<typeof refreshJwtConfig>,
    private userService: UserService,
    private refreshTokenService: RefreshTokenService,
    @InjectEntityManager()
    private entityManager: EntityManager,
    private readonly passwordHasher: PasswordHasher,
    private readonly emailVerificationService: EmailVerificationService,
  ) {
    const comparePassword = randomUUID();
    this.dummy_password_hash = this.passwordHasher.hash(comparePassword);
  }

  async validateUser({ email, password }: LoginPaylodDTO) {
    const user = await this.userService.read({ email });
    if (!user) {
      await this.passwordHasher.verify(
        password,
        await this.dummy_password_hash,
      );

      this.rejectInvalidCredentials();
    }

    this.userService.assertAccountNotLocked(user);
    const isMatch = await this.verifyPassword(password, user);
    if (!isMatch) {
      await this.recordFailedLogin(user.id);
      this.rejectInvalidCredentials();
    }

    this.userService.assertEmailVerified(user);
    const validatedUser = await this.resetLoginFailures(user.id);
    const { password_hash, ...safeUser } = validatedUser;
    return safeUser;
  }

  private verifyPassword(password: string, user: Users) {
    return this.passwordHasher.verify(password, user.password_hash);
  }

  private async recordFailedLogin(userId: string) {
    await this.entityManager.transaction(async (manager) => {
      const user = await this.readUserForLoginUpdate(manager, userId);
      this.userService.assertAccountNotLocked(user);

      const now = Date.now();
      const windowMs = 15 * 60 * 1000;
      const lockExpired =
        user.unlock_at !== null && user.unlock_at.getTime() <= now;
      const windowExpired =
        !user.failed_login_window_started_at ||
        now - user.failed_login_window_started_at.getTime() >= windowMs;
      const startNewWindow = lockExpired || windowExpired;
      const attempts = startNewWindow ? 1 : user.login_attemps + 1;

      await manager.update(Users, userId, {
        login_attemps: attempts,
        failed_login_window_started_at: startNewWindow
          ? new Date(now)
          : user.failed_login_window_started_at,
        unlock_at: attempts >= 5 ? new Date(now + windowMs) : null,
      });
    });
  }

  private async resetLoginFailures(userId: string) {
    return this.entityManager.transaction(async (manager) => {
      const user = await this.readUserForLoginUpdate(manager, userId);
      this.userService.assertAccountNotLocked(user);
      const changes = {
        login_attemps: 0,
        unlock_at: null,
        failed_login_window_started_at: null,
      };
      await manager.update(Users, userId, changes);
      return Object.assign(user, changes);
    });
  }

  private async readUserForLoginUpdate(manager: EntityManager, userId: string) {
    const user = await manager.findOne(Users, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) this.rejectInvalidCredentials();
    return user;
  }

  private rejectInvalidCredentials(): never {
    throw new UnauthorizedException({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: getMessage('auth', 'INVALID_CREDENTIALS'),
      },
    });
  }

  async login(user: { id: string }, headers: DeviceHeadersDto) {
    const tokens = await this.refreshTokenService.generateTokens(user.id);

    await this.entityManager.transaction(async (manager) => {
      const family = await manager.save(RefreshFamilies, {
        user_id: user.id,
        device_id: headers.deviceId,
        revoked_at: null,
      });
      await manager.insert(RefreshTokens, {
        users_id: { id: user.id },
        family_id: family.id,
        device_id: headers.deviceId,
        jti: tokens.jti,
        token_hash: tokens.token_hash,
        expires_at: tokens.expires_at,
        used_at: null,
        revoked_at: null,
      });
    });

    return tokens.response;
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
      console.error(getMessage('auth', 'EMAIL_DELIVERY_FAILED'), error);
    }
    return { user_id: user.id };
  }

  async emailVerification(@Body() dto: EmailVerificationDTO) {
    await this.emailVerificationService.sendVerificationEmail(dto.email);
  }

  async emailVerificationConfirm(@Body() dto: EmailVerificationConfirmDTO) {
    await this.emailVerificationService.verifyToken(dto);
  }

  async delete(req: DeletePayloadDTO) {
    const deleteUser = await this.userService.delete(req.id);
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

  async refresh(dto: RefreshPlayloadDTO) {
    const claims = await this.refreshTokenService.readRefreshClaims(
      dto.refresh_token,
    );
    if (!claims) throw this.refreshTokenService.invalidRefreshToken();

    const response = await this.entityManager.transaction(async (manager) => {
      const session = await this.lockRefreshSession(manager, claims);
      if (!session) return null;
      const { token, family } = session;

      if (
        !(await this.passwordHasher.verify(dto.refresh_token, token.token_hash))
      ) {
        return null;
      }

      if (token.used_at) {
        await manager.update(RefreshFamilies, family.id, {
          revoked_at: new Date(),
        });
        return null;
      }

      if (token.revoked_at || token.expires_at.getTime() <= Date.now()) {
        return null;
      }

      const next = await this.refreshTokenService.generateTokens(claims.sub);
      await manager.update(RefreshTokens, token.id, { used_at: new Date() });
      await manager.insert(RefreshTokens, {
        users_id: { id: claims.sub },
        family_id: family.id,
        device_id: family.device_id,
        jti: next.jti,
        token_hash: next.token_hash,
        expires_at: next.expires_at,
        used_at: null,
        revoked_at: null,
      });
      return next.response;
    });

    if (!response) throw this.refreshTokenService.invalidRefreshToken();
    return response;
  }

  async me(userId: string) {
    const user = await this.userService.findById(userId);
    if (!user)
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: getMessage('auth', 'INVALID_CREDENTIALS'),
        },
      });

    return {
      user_id: user.id,
      email: user.email,
      email_verified: Boolean(user.email_verified_at),
      has_password: Boolean(user.password_hash),
      linked_providers: [],
    };
  }

  async logout(raw: string) {
    const claims = await this.refreshTokenService.readRefreshClaims(raw);
    if (!claims) return;

    await this.entityManager.transaction(async (manager) => {
      const session = await this.lockRefreshSession(manager, claims);
      if (!session) return;

      if (!(await this.passwordHasher.verify(raw, session.token.token_hash))) {
        return;
      }

      await manager.update(RefreshFamilies, session.family.id, {
        revoked_at: new Date(),
      });
    });
  }

  async logoutAll(userId: string) {
    await this.entityManager.transaction(async (manager) => {
      await this.lockAllRefreshSession(manager, userId);

      // only the live ones, a family already logged out keeps its revoked_at
      await manager.update(
        RefreshFamilies,
        { user_id: userId, revoked_at: IsNull() },
        {
          revoked_at: new Date(),
        },
      );
    });
  }

  private async lockRefreshSession(
    manager: EntityManager,
    claims: { sub: string; jti: string },
  ) {
    const existing = await manager.findOne(RefreshTokens, {
      where: { jti: claims.jti },
    });

    if (!existing) return null;

    const family = await manager.findOne(RefreshFamilies, {
      where: {
        id: existing.family_id,
        user_id: claims.sub,
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!family || family.revoked_at) return null;

    const token = await manager.findOne(RefreshTokens, {
      where: { id: existing.id },
    });

    return token ? { token, family } : null;
  }

  private async lockAllRefreshSession(manager: EntityManager, userId: string) {
    await manager.find(RefreshFamilies, {
      where: {
        user_id: userId,
        revoked_at: IsNull(),
      },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
  }
}
