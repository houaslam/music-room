import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RegisterPayloadDTO } from './dto/register.dto.js';
import { HeadersGuard } from './guards/headers.guard.js';
import { DeletePayloadDTO } from './dto/delete.dto.js';
import { EmailVerificationConfirmDTO } from './dto/email-verification-confirm.dto.js';
import { EmailVerificationDTO } from './dto/email-verification.dto.js';
import { AuthService } from './auth.service.js';
import { LoginPaylodDTO } from './dto/login.dto.js';
import { Throttle } from '@nestjs/throttler';
import { RateLimitGuard } from './guards/throttle.guard.js';

@UseGuards(HeadersGuard)
@UseGuards(RateLimitGuard)
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterPayloadDTO) {
    return await this.authService.register(dto);
  }

  // @Throttle({ default: { ttl: 60 * 1000, limit: 120 } })
  // @Post('refresh')
  // async refresh() {}

  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 100 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginPaylodDTO) {
    const user = await this.authService.validateUser(dto);
    return await this.authService.login(user);
  }

  // @UseGuards(JWTGuard)
  @Delete('delete')
  async delete(@Body() dto: DeletePayloadDTO) {
    await this.authService.delete(dto);
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
}
