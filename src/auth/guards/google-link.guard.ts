import { ExecutionContext, Injectable } from '@nestjs/common';
import { GoogleAuthGuard } from './google.guard.js';

@Injectable()
export class GoogleLinkGuard extends GoogleAuthGuard {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.oauthIntent = {
      intent: 'link',
      appUserId: req.user,
    };

    return { property: 'googlePrincipal' };
  }
}
