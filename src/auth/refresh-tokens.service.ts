import { InjectRepository } from '@nestjs/typeorm';
import { RefreshTokens } from './entities/refresh-tokens.entity.js';
import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly passwordHasher: PasswordHasher,

    @InjectRepository(RefreshTokens)
    private refreshTokenRepository: Repository<RefreshTokens>,
  ) {}

  async read(id: string) {
    const findToken = await this.refreshTokenRepository.findOne({
      where: { users_id: { id } },
      order: { created_at: 'DESC' },
    });
    return findToken;
  }

  async create(id: string, token: string) {
    const createdToken = this.refreshTokenRepository.create({
      users_id: { id },
      token_hash: await this.passwordHasher.hash(token),
    });
    await this.refreshTokenRepository.save(createdToken);
  }
}
