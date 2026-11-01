import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { OAuthService } from './oauth.service.js';
import { RateLimitGuard } from './guards/throttle.guard.js';
import { GoogleAuthGuard } from './guards/google.guard.js';
import { JWTGuard } from './guards/jwt.guard.js';
import { GoogleLinkGuard } from './guards/google-link.guard.js';

@UseGuards(RateLimitGuard)
@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private authService: AuthService,
    private oauthService: OAuthService,
  ) {}

  @UseGuards(GoogleAuthGuard)
  @Get('google')
  async oauth(@Req() req: any) {}

  @UseGuards(JWTGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('google')
  async unlink(@Req() req: any) {
    await this.oauthService.unlink(req.user)
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: any) {
    const pending = req.verifiedOAuthIntent;
    delete req.verifiedOAuthIntent;
    if (pending?.intent === 'link') {
      await this.oauthService.link(pending.appUserId, req.user);
      return { message: 'Google account linked successfully' };
    }
    const account = await this.oauthService.oauth(req);
    const tokens = await this.authService.login(account, null);
    return { ...tokens, is_new_user: account.is_new_user };
  }

  @UseGuards(JWTGuard, GoogleLinkGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('google/link')
  async googleLink(@Req() req: any) {}
}
