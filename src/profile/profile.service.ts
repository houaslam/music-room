import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Profiles } from './entities/profiles.entity.js';
import { Repository } from 'typeorm';
import { CreateProfileDTO } from './dto/create-profile.dto.js';
import { error } from 'console';
import { getMessage } from '../messages.js';
import { MusicPreferences } from './entities/music-preferences.entity.js';
import { UpdateProfileChangesDTO } from './dto/update-profile.dto.js';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Profiles)
    private profilesRepository: Repository<Profiles>,
    @InjectRepository(MusicPreferences)
    private musicPreferences: Repository<MusicPreferences>,
  ) {}

  async create(userId: string, dto: CreateProfileDTO): Promise<Profiles> {
    const profile = this.profilesRepository.create({
      ...dto,
      user_id: userId,
    });
    return this.profilesRepository.save(profile);
  }

  async getMeProfileInfo(userId: string) {
    if (!userId)
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: getMessage('auth', 'INVALID_CREDENTIALS'),
        },
      });
    const existingProfile = await this.profilesRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!existingProfile)
      throw new NotFoundException({
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: getMessage('profile', 'PROFILE_NOT_FOUND'),
        },
      });

    const music_preferences = await this.musicPreferences.findOneBy({
      user_id: userId,
    });

    const { updated_at, ...profile } = existingProfile;
    return { music_preferences, ...profile };
  }

  async updateProfile(userId: string, changes: UpdateProfileChangesDTO) {
    if (!userId)
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: getMessage('auth', 'INVALID_CREDENTIALS'),
        },
      });
    console.log('HAHAHAHA');

    const existingProfile = await this.profilesRepository.findOneBy({
      user_id: userId,
    });

    if (!existingProfile)
      throw new NotFoundException({
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: getMessage('profile', 'PROFILE_NOT_FOUND'),
        },
      });

    await this.profilesRepository.update(userId, changes);
  }
}
