import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  UnauthorizedException,
  ValidationPipe,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { EntityManager } from 'typeorm';
import request from 'supertest';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';
import { Profiles } from './entities/profiles.entity.js';
import { MusicPreferences } from './entities/music-preferences.entity.js';
import { ProfileItemsVisibility as Visibility } from './entities/profiles.enum.js';
import { JWTGuard } from '../auth/guards/jwt.guard.js';
import {
  OWNER,
  FRIEND,
  STRANGER,
  preferenceValues,
  profileFixture,
} from '../../test/fixtures/profile.js';

const tokens: Record<string, string> = {
  owner: OWNER,
  friend: FRIEND,
  stranger: STRANGER,
};
const clientHeaders = {
  'X-Platform': 'ios',
  'X-Device-Model': 'Test phone',
  'X-App-Version': '1.0.0',
  'X-Device-Id': STRANGER,
};

describe('ProfileController HTTP visibility', () => {
  let app: INestApplication;
  let fixture: ReturnType<typeof profileFixture>;
  beforeEach(async () => {
    fixture = profileFixture();
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [ProfileController],
      providers: [
        ProfileService,
        {
          provide: getRepositoryToken(Profiles),
          useValue: fixture.profilesRepository,
        },
        {
          provide: getRepositoryToken(MusicPreferences),
          useValue: fixture.musicRepository,
        },
        { provide: EntityManager, useValue: fixture.manager },
      ],
    })
      .overrideGuard(JWTGuard)
      .useValue({
        // Authentication cryptography is tested in auth contracts. Use three actors
        // here while keeping the real controller, service, headers guard and pipes.
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          const actor =
            tokens[
              String(req.headers.authorization ?? '').replace(/^Bearer /, '')
            ];
          if (!actor)
            throw new UnauthorizedException({
              error: { code: 'INVALID_CREDENTIALS' },
            });
          req.user = actor;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () =>
          new BadRequestException({ error: { code: 'VALIDATION_ERROR' } }),
      }),
    );
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
  });

  it('creates the controller with its service and guard dependencies', () => {
    expect(app.get(ProfileController)).toBeDefined();
  });

  it('returns every field and visibility setting to the owner through /me and /:user_id', async () => {
    fixture.profile.bio_visibility = Visibility.PRIVATE;
    fixture.profile.birth_date_visibility = Visibility.PRIVATE;
    fixture.profile.phone_visibility = Visibility.PRIVATE;
    fixture.profile.prefs_visibility = Visibility.PRIVATE;
    const expected = {
      user_id: OWNER,
      display_name: 'Alex',
      avatar_url: fixture.profile.avatar_url,
      bio: fixture.profile.bio,
      birth_date: fixture.profile.birth_date,
      phone: fixture.profile.phone,
      bio_visibility: 'private',
      birth_date_visibility: 'private',
      phone_visibility: 'private',
      prefs_visibility: 'private',
      music_preferences: preferenceValues,
    };
    for (const path of ['me', OWNER]) {
      await request(app.getHttpServer())
        .get(`/api/v1/profile/${path}`)
        .set(clientHeaders)
        .set('Authorization', 'Bearer owner')
        .expect(200, expected);
    }
  });

  it.each(['friend', 'stranger'])(
    'returns public fields but no private fields or visibility settings to a %s',
    async (actor) => {
      fixture.profile.bio_visibility = Visibility.PUBLIC;
      fixture.profile.birth_date_visibility = Visibility.PRIVATE;
      fixture.profile.phone_visibility = Visibility.FRIENDS;
      fixture.profile.prefs_visibility = Visibility.FRIENDS;
      const expected = {
        user_id: OWNER,
        display_name: 'Alex',
        avatar_url: fixture.profile.avatar_url,
        bio: fixture.profile.bio,
        ...(actor === 'friend'
          ? {
              phone: fixture.profile.phone,
              music_preferences: preferenceValues,
            }
          : {}),
      };
      await request(app.getHttpServer())
        .get(`/api/v1/profile/${OWNER}`)
        .set(clientHeaders)
        .set('Authorization', `Bearer ${actor}`)
        .expect(200, expected);
    },
  );

  it('handles the reversed accepted friendship direction in the serialized response', async () => {
    fixture.profile.bio_visibility = Visibility.FRIENDS;
    Object.assign(fixture.state.friendship!, {
      requester_id: FRIEND,
      addressee_id: OWNER,
    });
    const res = await request(app.getHttpServer())
      .get(`/api/v1/profile/${OWNER}`)
      .set(clientHeaders)
      .set('Authorization', 'Bearer friend')
      .expect(200);
    expect(res.body.bio).toBe(fixture.profile.bio);
    expect(res.body).not.toHaveProperty('user');
    expect(res.body.music_preferences).toEqual(preferenceValues);
  });

  it('hides friends-only fields after the friendship is removed', async () => {
    fixture.profile.phone_visibility = Visibility.FRIENDS;
    const get = () =>
      request(app.getHttpServer())
        .get(`/api/v1/profile/${OWNER}`)
        .set(clientHeaders)
        .set('Authorization', 'Bearer friend');
    expect((await get().expect(200)).body).toHaveProperty('phone');
    fixture.state.friendship = null;
    expect((await get().expect(200)).body).not.toHaveProperty('phone');
  });

  it('rejects malformed path IDs rather than querying a missing user_id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/profile/not-a-uuid')
      .set(clientHeaders)
      .set('Authorization', 'Bearer stranger')
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(fixture.manager.findOne).not.toHaveBeenCalled();
  });

  it('returns PROFILE_NOT_FOUND for an absent profile', async () => {
    fixture.state.profile = null;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/profile/${OWNER}`)
      .set(clientHeaders)
      .set('Authorization', 'Bearer stranger')
      .expect(404);
    expect(res.body.error.code).toBe('PROFILE_NOT_FOUND');
  });

  it('requires authentication and the existing client headers', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/profile/${OWNER}`)
      .set(clientHeaders)
      .expect(401);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/profile/${OWNER}`)
      .set('Authorization', 'Bearer stranger')
      .expect(400);
    expect(res.body.error.code).toBe('MISSING_CLIENT_HEADERS');
  });
});
