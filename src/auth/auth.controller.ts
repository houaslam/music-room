import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LocalGuard } from './guards/local.guard.js';
import type { Request } from 'express';
import { JWTGuard } from './guards/jwt.guard.js';
import { DeletePayloadDTO, RegisterPayloadDTO } from './dto/auth.dto.js';
import { UserService } from '../user/user.service.js';
import * as bcrypt from 'bcrypt';
import { HeadersGuard } from './guards/headers.guard.js';

@UseGuards(HeadersGuard)
@Controller('auth')
export class AuthController {
  private saltOrRounds: number = 10;
  constructor(private userService: UserService) {}

  // @Post('login')
  // @UseGuards(LocalGuard)
  // login(@Req() req: Request) {
  //   return req.user;
  // }

  // @UseGuards(JWTGuard)
  // @Get('status')
  // status(@Req() request: Request) {
  //   return request.user;
  // }
  @Post('register')
  async register(@Body() req: RegisterPayloadDTO) {
    const password_hash = await bcrypt.hash(req.password, this.saltOrRounds);
    const newUser = {
      email: req.email,
      password_hash,
      display_name: req.display_name,
    };
    const createdUser = await this.userService.create(newUser);
    return { user_id: createdUser.id };
  }

  // @UseGuards(JWTGuard)
  @Delete('delete')
  async delete(@Body() req: DeletePayloadDTO) {
    const deleteUser = await this.userService.delete(req);
    const isDeleted = deleteUser.affected === 1;

    if (isDeleted) return { message: 'User Deleted Successfully' };

    throw new HttpException({"message":'User Deletion was unsuccessfull', code: "DATA_CONFLICT"}, 409);
  }

  // @UseGuards(JWTGuard)
  // @Get("me")
  // async me(@Req() req: Request){
  //   // return await this.userService.read(req.email)
  // }
}
