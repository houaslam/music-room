import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RateLimitGuard } from './guards/throttle.guard.js';
import { GoogleAuthGuard } from './guards/google.guard.js';

// @UseGuards(HeadersGuard)
@UseGuards(RateLimitGuard)
@Controller('auth/oauth')
export class OAuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(GoogleAuthGuard)
  @Get('google')
  async oauth(@Req() req: any) {}

  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: any) {
    const account = await this.authService.oauth(req);
    const tokens = await this.authService.login(account, null);
    return { ...tokens, is_new_user: account.is_new_user };
  }
}
