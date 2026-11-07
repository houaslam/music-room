import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JWTGuard } from '../auth/guards/jwt.guard.js';
import { HeadersGuard } from '../auth/guards/headers.guard.js';
import { RateLimitGuard } from '../auth/guards/throttle.guard.js';
import { FriendsService } from './friends.service.js';
import {
  EmptyFriendsDto,
  FriendRequestsQueryDto,
  FriendshipIdDto,
  FriendUserIdDto,
  SearchFriendsQueryDto,
  SendFriendRequestDto,
} from './dto/friends.dto.js';

@Controller('friends')
@UseGuards(JWTGuard, HeadersGuard, RateLimitGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: () =>
      new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
        },
      }),
  }),
)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listFriends(
    @Req() req: { user: string },
    @Query() _query: EmptyFriendsDto,
    @Body() _body: EmptyFriendsDto,
  ) {
    return this.friendsService.listFriends(req.user);
  }

  @Get('users')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  searchUsers(
    @Req() req: { user: string },
    @Query() query: SearchFriendsQueryDto,
    @Body() _body: EmptyFriendsDto,
  ) {
    return this.friendsService.searchUsers(req.user, query.display_name);
  }

  @Get('requests')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listRequests(
    @Req() req: { user: string },
    @Query() query: FriendRequestsQueryDto,
    @Body() _body: EmptyFriendsDto,
  ) {
    return this.friendsService.listRequests(
      req.user,
      query.direction ?? 'incoming',
    );
  }

  @Post('requests')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async sendRequest(
    @Req() req: { user: string },
    @Body() body: SendFriendRequestDto,
    @Query() _query: EmptyFriendsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.friendsService.sendRequest(
      req.user,
      body.addressee_id,
    );
    res.status(result.created ? 201 : 200);
    return result.friendship;
  }

  @Patch('requests/:id/accept')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  acceptRequest(
    @Req() req: { user: string },
    @Param() params: FriendshipIdDto,
    @Query() _query: EmptyFriendsDto,
    @Body() _body: EmptyFriendsDto,
  ) {
    return this.friendsService.acceptRequest(req.user, params.id);
  }

  @Delete('requests/:id')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  declineRequest(
    @Req() req: { user: string },
    @Param() params: FriendshipIdDto,
    @Query() _query: EmptyFriendsDto,
    @Body() _body: EmptyFriendsDto,
  ) {
    return this.friendsService.declineRequest(req.user, params.id);
  }

  @Get('relationships/:user_id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getRelationship(
    @Req() req: { user: string },
    @Param() params: FriendUserIdDto,
    @Query() _query: EmptyFriendsDto,
    @Body() _body: EmptyFriendsDto,
  ) {
    return this.friendsService.getRelationship(req.user, params.user_id);
  }

  @Delete(':user_id')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  deleteFriendship(
    @Req() req: { user: string },
    @Param() params: FriendUserIdDto,
    @Query() _query: EmptyFriendsDto,
    @Body() _body: EmptyFriendsDto,
  ) {
    return this.friendsService.deleteFriendship(req.user, params.user_id);
  }
}
