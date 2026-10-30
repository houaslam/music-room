import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthPayloadDTO } from './dto/auth.dto.js';
import { UserService } from '../user/user.service.js';
import * as bcrypt from "bcrypt"


@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService, private userService: UserService) {}
  async validateUser({ username, password }: AuthPayloadDTO) {
    const findUser = await this.userService.read({email:username});
    if (!findUser) return null;
    if (!bcrypt.compare(password, findUser.password_hash)) {
      const { password_hash, ...user } = findUser;
      return this.jwtService.sign(user);
    }
  }
}
