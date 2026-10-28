import { PasswordHashingModule } from '../security/password-hashing.module.js';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './strategies/local.strategy.js';
import { JWTStrategy } from './strategies/jwt.strategy.js';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '../user/user.module.js';
import { EmailModule } from '../email/email.module.js';
import jwtConfig from './config/jwt.config.js';
import refreshJwtConfig from './config/refresh-jwt.config.js';
import { ProfileModule } from '../profile/profile.module.js';
import { RateLimitGuard } from './guards/throttle.guard.js';

@Module({
  imports: [
    PasswordHashingModule,
    PassportModule,
    UserModule,
    EmailModule,
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
    ConfigModule.forFeature(refreshJwtConfig),
    ProfileModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JWTStrategy, RateLimitGuard],
})
export class AuthModule {}
