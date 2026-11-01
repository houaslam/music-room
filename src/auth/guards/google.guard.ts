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
    info?: { message?: string },
  ): TUser {
    if (error instanceof HttpException) throw error;
    if (error || !user) {
      console.warn('GOOGLE AUTH FAILURE', {
        reason: info?.message,
        errorType: error instanceof Error ? error.name : undefined,
      });
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
