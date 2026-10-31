import { InjectRepository } from '@nestjs/typeorm';
import { RefreshTokens } from './entities/refresh-tokens.entity.js';
import { Repository } from 'typeorm';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as config from '@nestjs/config';
import refreshJwtConfig from './config/refresh-jwt.config.js';
import { JwtPayload } from 'jsonwebtoken';
import { isUUID } from 'class-validator';
import { getMessage } from '../messages.js';

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly passwordHasher: PasswordHasher,

    @InjectRepository(RefreshTokens)
    private refreshTokenRepository: Repository<RefreshTokens>,
    private jwtService: JwtService,
    @Inject(refreshJwtConfig.KEY)
    private refreshTokenConfig: config.ConfigType<typeof refreshJwtConfig>,
  ) {}

  async read(id: string) {
    const findToken = await this.refreshTokenRepository.findOne({
      where: { users_id: { id } },
      order: { created_at: 'DESC' },
    });
    return findToken;
  }

  async create(id: string, token: string, expires_at: Date) {
    const createdToken = this.refreshTokenRepository.create({
      users_id: { id },
      token_hash: await this.passwordHasher.hash(token),
      expires_at,
    });
    return await this.refreshTokenRepository.save(createdToken);
  }

  async generateTokens(userId: string) {
    const accessToken = await this.jwtService.signAsync({ sub: userId });

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, jti: randomUUID() },
      this.refreshTokenConfig,
    );

    const access = this.jwtService.decode<JwtPayload>(accessToken);
    const refresh = this.jwtService.decode<JwtPayload>(refreshToken);

    if (!access.exp || !access.iat || !refresh.exp || !refresh.jti) {
      throw new InternalServerErrorException('Token expiry is not configured');
    }

    return {
      response: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: access.exp - access.iat,
      },
      token_hash: await this.passwordHasher.hash(refreshToken),
      expires_at: new Date(refresh.exp * 1000),
      jti: refresh.jti,
    };
  }

  async readRefreshClaims(raw: string) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(raw, {
        secret: this.refreshTokenConfig.secret,
      });

      if (
        typeof payload.sub !== 'string' ||
        !isUUID(payload.sub) ||
        typeof payload.jti !== 'string' ||
        !isUUID(payload.jti) ||
        typeof payload.exp !== 'number'
      ) {
        return null;
      }

      return { sub: payload.sub, jti: payload.jti };
    } catch {
      return null;
    }
  }

  invalidRefreshToken() {
    return new UnauthorizedException({
      error: {
        code: 'INVALID_REFRESH_TOKEN',
        message: getMessage('auth', 'INVALID_REFRESH_TOKEN'),
      },
    });
  }
}
