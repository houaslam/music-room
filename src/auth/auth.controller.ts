import {
  Body,
  Controller,
  Delete,
  HttpException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RegisterPayloadDTO } from './dto/register.dto.js';
import { UserService } from '../user/user.service.js';
import * as bcrypt from 'bcrypt';
import { HeadersGuard } from './guards/headers.guard.js';
import { EmailService } from '../email/email.service.js';
import { DeletePayloadDTO } from './dto/delete.dto.js';
import { EmailVerificationConfirmDTO } from './dto/email-verification-confirm.dto.js';
import { EmailVerificationDTO } from './dto/email-verification.dto.js';

@UseGuards(HeadersGuard)
@Controller('auth')
export class AuthController {
  private saltOrRounds: number = 10;
  constructor(
    private userService: UserService,
    private emailService: EmailService,
  ) {}

  @Post('register')
  async register(@Body() req: RegisterPayloadDTO) {
    const password_hash = await bcrypt.hash(req.password, this.saltOrRounds);
    const newUser = {
      email: req.email,
      password_hash,
      display_name: req.display_name,
    };
    const createdUser = await this.userService.create(newUser);
    await this.emailVerification({ email: req.email });
    return { user_id: createdUser.id };
  }

  // @UseGuards(JWTGuard)
  @Delete('delete')
  async delete(@Body() req: DeletePayloadDTO) {
    const deleteUser = await this.userService.delete(req);
    const isDeleted = deleteUser.affected === 1;

    if (isDeleted) return { message: 'User Deleted Successfully' };

    throw new HttpException(
      { message: 'User Deletion was unsuccessfull', code: 'DATA_CONFLICT' },
      409,
    );
  }

  @Post('email-verification')
  async emailVerification(@Body() dto: EmailVerificationDTO) {
    await this.emailService.sendOtpToEmail(dto.email);
    return { messgae: 'Email sent Successfuly' };
  }

  @Post('email-verification/confirm')
  async emailVerificationConfirm(@Body() dto: EmailVerificationConfirmDTO) {
    await this.emailService.verifyToken(dto);
    return { messgae: 'Email is verified Successfuly' };
  }
}
