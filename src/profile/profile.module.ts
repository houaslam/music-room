import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service.js';
import { ProfileController } from './profile.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profiles } from './entities/profiles.entity.js';
import { MusicPreferences } from './entities/music-preferences.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Profiles, MusicPreferences])],
  providers: [ProfileService],
  controllers: [ProfileController],
  exports: [ProfileService]
})
export class ProfileModule {}
