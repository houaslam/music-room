import { Module } from '@nestjs/common';
import { FriendsController } from './friends.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Friendships } from './entities/friends.entity.js';
import { FriendsService } from './friends.service.js';

@Module({
  providers: [FriendsService],
  controllers: [FriendsController],
  imports: [TypeOrmModule.forFeature([Friendships])],
})
export class FriendsModule {}
