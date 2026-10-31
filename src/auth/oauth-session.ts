import type { ConfigService } from '@nestjs/config';
import session from 'express-session';


export function createOAuthSession(config: ConfigService) {
  return session({
    name: 'music-room.oauth',
    secret:
      config.get<string>('OAUTH_SESSION_SECRET') ??
      config.getOrThrow<string>('ACCESS_TOKEN_SECRET'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.get<string>('NODE_ENV') === 'production',
      maxAge: 10 * 60 * 1000,
      path: '/api/v1/auth/oauth',
    },
  });
}
