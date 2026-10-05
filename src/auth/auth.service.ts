import { Injectable } from '@nestjs/common';
import { AuthPayloadDTO } from './dto/auth.dto.js';
import { JwtService } from '@nestjs/jwt';

const fakeUsers = [
  {
    id: 1,
    username: 'hajar',
    password: 'hehehe',
  },
];

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}
  validateUser({ username, password }: AuthPayloadDTO) {
    const findUser = fakeUsers.find((user) => user.username === username);
    if (!findUser) return null;
    if (findUser.password === password) {
      const { password, ...user } = findUser;
      return this.jwtService.sign(user);
    }
  }
}
