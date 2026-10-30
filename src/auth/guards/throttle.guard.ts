import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

export class RateLimitGuard extends ThrottlerGuard {
  protected override async throwThrottlingException() {
    throw new HttpException(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
