import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProfileService } from './profile.service.js';
import { JWTGuard } from '../auth/guards/jwt.guard.js';
import { HeadersGuard } from '../auth/guards/headers.guard.js';
import { RateLimitGuard } from '../auth/guards/throttle.guard.js';
import { UpdateProfileChangesDTO } from './dto/update-profile.dto.js';

@Controller('profile')
@UseGuards(JWTGuard, HeadersGuard, RateLimitGuard)
export class ProfileController {
  constructor(private profileServics: ProfileService) {}
  @Get('me')
  async me(@Req() req: { user: string }) {
    return await this.profileServics.getMeProfileInfo(req.user);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('me')
  async updateMe(
    @Req() req: { user: string },
    @Body() changes: UpdateProfileChangesDTO,
  ) {
    return await this.profileServics.updateProfile(req.user, changes);
  }
}
