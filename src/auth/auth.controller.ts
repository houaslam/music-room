import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RegisterPayloadDTO } from './dto/register.dto.js';
import { HeadersGuard } from './guards/headers.guard.js';
import { EmailVerificationConfirmDTO } from './dto/email-verification-confirm.dto.js';
import { EmailVerificationDTO } from './dto/email-verification.dto.js';
import { AuthService } from './auth.service.js';
import { LoginPaylodDTO } from './dto/login.dto.js';
import { Throttle } from '@nestjs/throttler';
import { RateLimitGuard } from './guards/throttle.guard.js';
import { RefreshPlayloadDTO } from './dto/refresh.dto.js';
import { DeviceHeadersDto } from './dto/headers-validation.dto.js';
import { JWTGuard } from './guards/jwt.guard.js';
import { LogOutPayloadDTO } from './dto/log-out.dto.js';
import { PasswordResetPayloadDTO } from './dto/password-reset.dto.js';
import { PasswordResetConfirmPayloadDTO } from './dto/password-reset-confirm.dto.js';

@UseGuards(HeadersGuard)
@UseGuards(RateLimitGuard)
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterPayloadDTO) {
    return await this.authService.register(dto);
  }

  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 100 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginPaylodDTO,
    @Req() req: { device: DeviceHeadersDto },
  ) {
    const user = await this.authService.validateUser(dto);
    return await this.authService.login(user, req.device);
  }

  @Throttle({ default: { ttl: 60 * 1000, limit: 120 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() dto: RefreshPlayloadDTO) {
    return await this.authService.refresh(dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Body() dto: LogOutPayloadDTO) {
    await this.authService.logout(dto.refresh_token);
  }

  @UseGuards(JWTGuard)
  @Delete('delete')
  async delete(@Req() req: { user: string }) {
    await this.authService.delete({ id: req.user });
  }

  @UseGuards(JWTGuard)
  @Get('me')
  async me(@Req() req: { user: string }) {
    return await this.authService.me(req.user);
  }

  @HttpCode(HttpStatus.ACCEPTED)
  @Post('email-verification')
  async emailVerification(@Body() dto: EmailVerificationDTO) {
    await this.authService.emailVerification(dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('email-verification/confirm')
  async emailVerificationConfirm(@Body() dto: EmailVerificationConfirmDTO) {
    await this.authService.emailVerificationConfirm(dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password-reset')
  async passwordReset(@Body() dto: PasswordResetPayloadDTO) {}

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password-reset/confirm')
  async PasswordResetConfirm(@Body() dto: PasswordResetConfirmPayloadDTO) {}
}
