import { registerAs } from '@nestjs/config';
import {
  JwtSignOptions,
} from '@nestjs/jwt';
import type { StringValue } from 'ms';

export default registerAs('refreshJwt', (): JwtSignOptions => ({
  secret: process.env.REFRESH_TOKEN_SECRET,
  expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN as StringValue
}));

