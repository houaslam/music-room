import { PasswordHashingModule } from '../security/password-hashing.module.js';
import { Module } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '../user/user.module.js';
import { EmailTokens } from './entities/email.entity.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailVerificationService } from './email-verification.service.js';

@Module({
  providers: [EmailService, EmailVerificationService],
  imports: [
    PasswordHashingModule,
    ConfigModule,
    UserModule,
    TypeOrmModule.forFeature([EmailTokens]),
  ],
  exports: [EmailService, EmailVerificationService],
})
export class EmailModule {}
