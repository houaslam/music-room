import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { Profiles } from './entities/profiles.entity.js';
import { EntityManager, Repository } from 'typeorm';
import { CreateProfileDTO } from './dto/create-profile.dto.js';
import { error } from 'console';
import { getMessage, MessageCode } from '../messages.js';
import { MusicPreferences } from './entities/music-preferences.entity.js';
import { UpdateProfileChangesDTO } from './dto/update-profile.dto.js';
import { Friendships } from '../friends/entities/friends.entity.js';
import { FriendshipStatus } from '../friends/entities/friends-enum.entity.js';
import { ProfileItemsVisibility } from './entities/profiles.enum.js';
import { Users } from '../user/entities/user.entity.js';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Profiles)
    private profilesRepository: Repository<Profiles>,
    @InjectRepository(MusicPreferences)
    private musicPreferences: Repository<MusicPreferences>,
    @InjectEntityManager() private readonly entityManager: EntityManager,
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

    return this.profileResponse(
      existingProfile,
      music_preferences,
      true,
      false,
    );
  }

  async updateProfile(userId: string, changes: UpdateProfileChangesDTO) {
    if (!userId)
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: getMessage('auth', 'INVALID_CREDENTIALS'),
        },
      });

    return await this.entityManager.transaction(async (manager) => {
      const existingProfile = await manager.findOneBy(Profiles, {
        user_id: userId,
      });

      if (!existingProfile)
        throw new NotFoundException({
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: getMessage('profile', 'PROFILE_NOT_FOUND'),
          },
        });
      const { music_preferences, ...profileChanges } = changes;
      await manager.update(Profiles, userId, profileChanges);
      if (music_preferences)
        await manager.upsert(
          MusicPreferences,
          { ...music_preferences, user_id: userId },
          ['user_id'],
        );
    });
  }

  error(code: MessageCode<'profile'>) {
    return {
      error: {
        code,
        message: getMessage('profile', code),
      },
    };
  }

  async getUsersProfile(user_id: string, search_user_id: string) {
    if (user_id == search_user_id) return await this.getMeProfileInfo(user_id);

    return await this.entityManager.transaction(async (manager) => {
      const profile = await manager.findOne(Profiles, {
        where: {
          user_id: search_user_id,
        },
        relations: { user: true },
      });
      if (!profile)
        throw new NotFoundException(this.error('PROFILE_NOT_FOUND'));

      const friendship = await manager.findOne(Friendships, {
        where: [
          {
            requester_id: user_id,
            addressee_id: search_user_id,
            status: FriendshipStatus.ACCEPTED,
          },
          {
            requester_id: search_user_id,
            addressee_id: user_id,
            status: FriendshipStatus.ACCEPTED,
          },
        ],
      });

      const isFriend = friendship !== null;
      const canViewPreferences = this.canView(
        profile.prefs_visibility,
        false,
        isFriend,
      );
      const music_preferences = canViewPreferences
        ? await manager.findOne(MusicPreferences, {
            where: { user_id: search_user_id },
          })
        : null;
      return this.profileResponse(profile, music_preferences, false, isFriend);
    });
  }

  private canView(
    visibility: ProfileItemsVisibility,
    isOwner: boolean,
    isFriend: boolean,
  ) {
    return (
      isOwner ||
      visibility === ProfileItemsVisibility.PUBLIC ||
      (visibility === ProfileItemsVisibility.FRIENDS && isFriend)
    );
  }

  private profileResponse(
    profile: Profiles,
    preferences: MusicPreferences | null,
    isOwner: boolean,
    isFriend: boolean,
  ) {
    const response: Record<string, unknown> = {
      user_id: profile.user_id,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    };
    for (const [field, visibility] of [
      ['bio', 'bio_visibility'],
      ['birth_date', 'birth_date_visibility'],
      ['phone', 'phone_visibility'],
    ] as const) {
      if (this.canView(profile[visibility], isOwner, isFriend))
        response[field] = profile[field];
    }
    if (this.canView(profile.prefs_visibility, isOwner, isFriend)) {
      response.music_preferences = preferences
        ? {
            genres: preferences.genres,
            favorite_artists: preferences.favorite_artists,
          }
        : null;
    }
    if (isOwner) {
      response.bio_visibility = profile.bio_visibility;
      response.birth_date_visibility = profile.birth_date_visibility;
      response.phone_visibility = profile.phone_visibility;
      response.prefs_visibility = profile.prefs_visibility;
    }
    return response;
  }
}
