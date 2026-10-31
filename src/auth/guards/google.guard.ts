import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  handleRequest<TUser = any>(
    error: unknown,
    user: TUser,
  ): TUser {
    if (error instanceof HttpException) throw error;
    if (error || !user) {
      throw new UnauthorizedException({
        error: {
          code: 'OAUTH_INVALID',
          message: 'Google authentication failed',
        },
      });
    }
    return user;
  }
}
