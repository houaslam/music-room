import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ProfileService } from './profile.service.js';
import { Profiles } from './entities/profiles.entity.js';
import { MusicPreferences } from './entities/music-preferences.entity.js';
import { ProfileItemsVisibility as Visibility } from './entities/profiles.enum.js';
import { FriendshipStatus } from '../friends/entities/friends-enum.entity.js';
import {
  OWNER,
  FRIEND,
  STRANGER,
  preferenceValues,
  profileFixture,
} from '../../test/fixtures/profile.js';

const fields = [
  ['bio', 'bio_visibility'],
  ['birth_date', 'birth_date_visibility'],
  ['phone', 'phone_visibility'],
  ['music_preferences', 'prefs_visibility'],
] as const;
const viewers = [
  ['owner', OWNER],
  ['friend', FRIEND],
  ['stranger', STRANGER],
] as const;
const cases = fields.flatMap(([field, setting]) =>
  Object.values(Visibility).flatMap((visibility) =>
    viewers.map(([viewer, id]) => ({ field, setting, visibility, viewer, id })),
  ),
);

describe('ProfileService', () => {
  let module: TestingModule;
  let service: ProfileService;
  let fixture: ReturnType<typeof profileFixture>;
  beforeEach(async () => {
    fixture = profileFixture();
    module = await Test.createTestingModule({
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
    }).compile();
    service = module.get(ProfileService);
  });
  afterEach(async () => {
    await module?.close();
  });

  it('creates a profile belonging to the supplied authenticated user', async () => {
    await expect(
      service.create(OWNER, { display_name: 'Hajar' }),
    ).resolves.toMatchObject({ user_id: OWNER, display_name: 'Hajar' });
  });
  it('does not let payload data replace the authenticated owner', async () => {
    await expect(
      service.create(OWNER, {
        display_name: 'Hajar',
        user_id: STRANGER,
      } as never),
    ).resolves.toMatchObject({ user_id: OWNER });
  });
  it('reports persistence failure rather than a created profile', async () => {
    fixture.profilesRepository.save.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(
      service.create(OWNER, { display_name: 'Hajar' }),
    ).rejects.toThrow('database unavailable');
  });

  it.each(cases)(
    '$viewer reads $field with $visibility visibility',
    async ({ field, setting, visibility, viewer, id }) => {
      fixture.profile[setting] = visibility;
      const result = JSON.parse(
        JSON.stringify(await service.getUsersProfile(id, OWNER)),
      );
      const allowed =
        viewer === 'owner' ||
        visibility === Visibility.PUBLIC ||
        (viewer === 'friend' && visibility === Visibility.FRIENDS);
      if (allowed)
        expect(result[field]).toEqual(
          field === 'music_preferences'
            ? preferenceValues
            : fixture.profile[field],
        );
      else expect(result).not.toHaveProperty(field);
      expect(result).toMatchObject({
        user_id: OWNER,
        display_name: 'Alex',
        avatar_url: fixture.profile.avatar_url,
      });
      for (const [, key] of fields) {
        if (viewer === 'owner') expect(result).toHaveProperty(key);
        else expect(result).not.toHaveProperty(key);
      }
    },
  );

  it.each(['owner-requester', 'owner-addressee'])(
    'recognizes accepted friends in either direction: %s',
    async (direction) => {
      fixture.profile.bio_visibility = Visibility.FRIENDS;
      if (direction === 'owner-addressee')
        Object.assign(fixture.state.friendship!, {
          requester_id: FRIEND,
          addressee_id: OWNER,
        });
      expect(await service.getUsersProfile(FRIEND, OWNER)).toHaveProperty(
        'bio',
        fixture.profile.bio,
      );
      expect(await service.getUsersProfile(STRANGER, OWNER)).not.toHaveProperty(
        'bio',
      );
    },
  );

  it.each([FriendshipStatus.PENDING, FriendshipStatus.BLOCKED, null])(
    'does not grant friends-only access for %s relationships',
    async (status) => {
      for (const [, key] of fields) fixture.profile[key] = Visibility.FRIENDS;
      if (status) fixture.state.friendship!.status = status;
      else fixture.state.friendship = null;
      const result = await service.getUsersProfile(FRIEND, OWNER);
      for (const [field] of fields) expect(result).not.toHaveProperty(field);
    },
  );

  it('revokes friends-only access on the next read after removal', async () => {
    fixture.profile.phone_visibility = Visibility.FRIENDS;
    expect(await service.getUsersProfile(FRIEND, OWNER)).toHaveProperty(
      'phone',
    );
    fixture.state.friendship = null;
    expect(await service.getUsersProfile(FRIEND, OWNER)).not.toHaveProperty(
      'phone',
    );
  });

  it('uses music preference visibility independently of phone visibility', async () => {
    fixture.profile.prefs_visibility = Visibility.PRIVATE;
    fixture.profile.phone_visibility = Visibility.FRIENDS;
    expect(await service.getUsersProfile(FRIEND, OWNER)).not.toHaveProperty(
      'music_preferences',
    );
    fixture.profile.prefs_visibility = Visibility.FRIENDS;
    fixture.profile.phone_visibility = Visibility.PRIVATE;
    const result = await service.getUsersProfile(FRIEND, OWNER);
    expect(result).toHaveProperty('music_preferences', preferenceValues);
    expect(result).not.toHaveProperty('phone');
  });

  it.each(viewers)(
    'never serializes account credentials or preference metadata for the %s',
    async (_, id) => {
      const result = JSON.parse(
        JSON.stringify(await service.getUsersProfile(id, OWNER)),
      );
      expect(result.music_preferences).toEqual(preferenceValues);
      const serialized = JSON.stringify(result);
      for (const secret of [
        'password_hash',
        'secret-password-hash',
        'private@example.test',
        'updated_at',
        '"user":',
      ]) {
        expect(serialized).not.toContain(secret);
      }
    },
  );

  it('preserves a visible null value while omitting a hidden field', async () => {
    fixture.profile.bio = null;
    fixture.profile.phone_visibility = Visibility.PRIVATE;
    const result = await service.getUsersProfile(STRANGER, OWNER);
    expect(result).toHaveProperty('bio', null);
    expect(result).not.toHaveProperty('phone');
  });

  it('does not fetch preferences when they are hidden', async () => {
    fixture.profile.prefs_visibility = Visibility.PRIVATE;
    await service.getUsersProfile(FRIEND, OWNER);
    expect(fixture.manager.findOne).not.toHaveBeenCalledWith(
      MusicPreferences,
      expect.anything(),
    );
  });

  it.each([OWNER, FRIEND, STRANGER])(
    'returns PROFILE_NOT_FOUND to %s for an absent profile',
    async (viewer) => {
      fixture.state.profile = null;
      await expect(
        service.getUsersProfile(viewer, OWNER),
      ).rejects.toMatchObject({
        status: 404,
        response: { error: { code: 'PROFILE_NOT_FOUND' } },
      });
    },
  );
});
