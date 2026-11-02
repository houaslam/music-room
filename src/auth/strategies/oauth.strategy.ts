import {
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';
import { getMessage } from '../../messages.js';
import { OAuthStateStore } from '../session/oauth-state.store.js';

export interface GooglePrincipal {
  id: string;
  email: string;
  email_verified: true;
  name: string;
  photo: string | null;
}

@Injectable()
export class OauthStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret:
        configService.get<string>('GOOGLE_CLIENT_SECRET') ??
        configService.getOrThrow<string>('GOOGLE_CLIENT_SECRECT'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_REDIRECT_URI'),
      scope: ['email', 'profile'],
      state: true,
      store: new OAuthStateStore(),
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<GooglePrincipal> {
    if (!profile || profile.provider !== 'google' || !profile.id?.trim()) {
      throw this.invalidProfile();
    }
    const email = profile.emails?.[0];
    if (!email?.value?.trim()) {
      throw new UnprocessableEntityException({
        error: {
          code: 'OAUTH_EMAIL_MISSING',
          message: getMessage('auth', 'OAUTH_EMAIL_MISSING'),
        },
      });
    }
    if (email.verified !== true && profile._json?.email_verified !== true) {
      throw this.invalidProfile();
    }
    const name =
      profile.displayName?.trim() ||
      [profile.name?.givenName, profile.name?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      email.value.split('@')[0];
    return {
      id: profile.id,
      email: email.value.trim().toLowerCase(),
      email_verified: true,
      name: name.slice(0, 50),
      photo: profile.photos?.[0]?.value ?? null,
    };
  }

  private invalidProfile() {
    return new UnauthorizedException({
      error: {
        code: 'OAUTH_INVALID',
        message: getMessage('auth', 'OAUTH_INVALID'),
      },
    });
  }
}
