import { InjectRepository } from '@nestjs/typeorm';
import { MusicPreferences } from './entities/music-preferences.entity.js';
import { Repository } from 'typeorm';

export class PusicPreferencesService {
  constructor(
    @InjectRepository(MusicPreferences)
    private musicPreferences: Repository<MusicPreferences>,
  ) {}

  async add(userId: string, changes: any) {
    const existingPreference = await this.musicPreferences.findOne({
      where: {
        user_id: userId,
      },
    });

    if (existingPreference)
      return await this.musicPreferences.update(userId, {
        genres: [...existingPreference.genres, changes.genre],
        favorite_artists: [
          ...existingPreference.favorite_artists,
          changes.favorite_artist,
        ],
      });
    const newPreference = this.musicPreferences.create({
      user_id: userId,
      genres: [changes.genre],
      favorite_artists: [changes.favorite_artist],
    });

    return await this.musicPreferences.save(newPreference);
  }

  async get(userId: string) {
    return await this.musicPreferences.findOne({
      where: {
        user_id: userId,
      },
    });
  }
}
