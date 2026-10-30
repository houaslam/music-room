import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Profiles } from './entities/profiles.entity.js';
import { Repository } from 'typeorm';
import { CreateProfileDTO } from './dto/create-profile.dto.js';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Profiles)
    private profilesRepository: Repository<Profiles>,
  ) {}

  async create(userId: string, dto: CreateProfileDTO): Promise<Profiles> {
    const profile = this.profilesRepository.create({
      ...dto,
      user_id: userId,
    });
    return this.profilesRepository.save(profile);
  }
}
