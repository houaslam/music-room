import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError } from 'typeorm';
import { getMessage } from '../messages.js';
import { Users } from '../user/entities/user.entity.js';
import { Profiles } from '../profile/entities/profiles.entity.js';
import { GoogleAccounts } from './entities/google-accounts.entity.js';
import type { GooglePrincipal } from './strategies/oauth.strategy.js';

@Injectable()
export class OAuthService {
  constructor(
    @InjectEntityManager() private readonly entityManager: EntityManager,
  ) {}

  async oauth(req: { user: any }) {
    const user = req.user;
    if (
      !user ||
      typeof user.id !== 'string' ||
      !user.id.trim() ||
      user.email_verified !== true
    )
      throw new UnauthorizedException({
        error: {
          code: 'OAUTH_INVALID',
          message: getMessage('auth', 'OAUTH_INVALID'),
        },
      });

    if (typeof user.email !== 'string' || !user.email.trim()) {
      throw new UnprocessableEntityException({
        error: {
          code: 'OAUTH_EMAIL_MISSING',
          message: getMessage('auth', 'OAUTH_EMAIL_MISSING'),
        },
      });
    }

    return this.entityManager.transaction(async (manager) => {
      const existingGoogleAccount = await manager.findOne(GoogleAccounts, {
        where: { google_user_id: user.id },
        relations: { users_id: true },
      });

      if (existingGoogleAccount) {
        return { id: existingGoogleAccount.users_id.id, is_new_user: false };
      }

      const email = user.email.trim().toLowerCase();
      const existingUser = await manager.findOne(Users, { where: { email } });
      if (existingUser) {
        throw new ConflictException({
          error: {
            code: 'LINK_REQUIRED',
            message: getMessage('auth', 'LINK_REQUIRED'),
          },
        });
      }

      const createdUser = await manager.save(Users, {
        email,
        display_name: user.name,
        password_hash: null,
        email_verified_at: new Date(),
      });

      await manager.save(GoogleAccounts, {
        users_id: { id: createdUser.id },
        google_user_id: user.id,
      });

      await manager.save(Profiles, {
        user_id: createdUser.id,
        display_name: createdUser.display_name,
        avatar_url: user.photo,
      });

      return { id: createdUser.id, is_new_user: true };
    });
  }

  async link(appUserId: string, googleUser: GooglePrincipal): Promise<void> {
    if (
      !googleUser ||
      typeof googleUser.id !== 'string' ||
      !googleUser.id.trim() ||
      googleUser.email_verified !== true
    ) {
      throw new UnauthorizedException({
        error: {
          code: 'OAUTH_INVALID',
          message: getMessage('auth', 'OAUTH_INVALID'),
        },
      });
    }

    if (typeof googleUser.email !== 'string' || !googleUser.email.trim()) {
      throw new UnprocessableEntityException({
        error: {
          code: 'OAUTH_EMAIL_MISSING',
          message: getMessage('auth', 'OAUTH_EMAIL_MISSING'),
        },
      });
    }

    try {
      await this.entityManager.transaction(async (manager) => {
        const existingGoogleAccount = await manager.findOne(GoogleAccounts, {
          where: { google_user_id: googleUser.id },
          relations: { users_id: true },
        });

        if (existingGoogleAccount) {
          if (existingGoogleAccount?.users_id.id == appUserId)
            throw new ConflictException({
              error: {
                code: 'PROVIDER_ALREADY_LINKED',
                message: getMessage('auth', 'PROVIDER_ALREADY_LINKED'),
              },
            });
          else
            throw new ConflictException({
              error: {
                code: 'PROVIDER_IDENTITY_IN_USE',
                message: getMessage('auth', 'PROVIDER_IDENTITY_IN_USE'),
              },
            });
        }

        const existingUser = await manager.findOne(Users, {
          where: { id: appUserId },
        });

        if (!existingUser) {
          throw new UnauthorizedException({
            error: {
              code: 'OAUTH_INVALID',
              message: getMessage('auth', 'OAUTH_INVALID'),
            },
          });
        }

        const existingLink = await manager.findOne(GoogleAccounts, {
          where: { users_id: { id: appUserId } },
        });

        if (existingLink) {
          throw new ConflictException({
            error: {
              code: 'PROVIDER_ALREADY_LINKED',
              message: getMessage('auth', 'PROVIDER_ALREADY_LINKED'),
            },
          });
        }

        await manager.save(GoogleAccounts, {
          users_id: { id: existingUser.id },
          google_user_id: googleUser.id,
        });
      });
    } catch (error) {
      if (
        !(error instanceof QueryFailedError) ||
        error.driverError?.code !== '23505'
      ) {
        throw error;
      }
      const identity = await this.entityManager.findOne(GoogleAccounts, {
        where: { google_user_id: googleUser.id },
        relations: { users_id: true },
      });
      if (identity && identity.users_id.id !== appUserId) {
        throw new ConflictException({
          error: {
            code: 'PROVIDER_IDENTITY_IN_USE',
            message: getMessage('auth', 'PROVIDER_IDENTITY_IN_USE'),
          },
        });
      }
      const linked =
        identity ??
        (await this.entityManager.findOne(GoogleAccounts, {
          where: { users_id: { id: appUserId } },
        }));
      if (linked) {
        throw new ConflictException({
          error: {
            code: 'PROVIDER_ALREADY_LINKED',
            message: getMessage('auth', 'PROVIDER_ALREADY_LINKED'),
          },
        });
      }
      throw error;
    }
  }
}
