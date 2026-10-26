import { Module } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '../user/user.module.js';
import { EmailTokens } from './entity/email.entity.js';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  providers: [EmailService],
  imports: [ConfigModule, UserModule, TypeOrmModule.forFeature([EmailTokens])],
  exports: [EmailService],
})
export class EmailModule {}
