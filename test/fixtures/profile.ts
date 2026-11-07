import { vi } from 'vitest';
import { Profiles } from '../../src/profile/entities/profiles.entity.js';
import { MusicPreferences } from '../../src/profile/entities/music-preferences.entity.js';
import { Friendships } from '../../src/friends/entities/friends.entity.js';
import { FriendshipStatus } from '../../src/friends/entities/friends-enum.entity.js';
import { ProfileItemsVisibility as Visibility } from '../../src/profile/entities/profiles.enum.js';

export const OWNER = '11111111-1111-4111-8111-111111111111';
export const FRIEND = '22222222-2222-4222-8222-222222222222';
export const STRANGER = '33333333-3333-4333-8333-333333333333';
export const preferenceValues = {
  genres: ['jazz'],
  favorite_artists: ['artist-123'],
};

// Evaluate the query's actual criteria: ignoring direction or status would make
// visibility tests pass even when the friendship lookup is incorrect.
function matches(
  row: Record<string, any>,
  where: Record<string, any>,
): boolean {
  return Object.entries(where).every(([field, value]) =>
    value !== null && typeof value === 'object'
      ? row[field] != null && matches(row[field], value)
      : row[field] === value,
  );
}

export function profileFixture() {
  const account = {
    id: OWNER,
    email: 'private@example.test',
    password_hash: 'secret-password-hash',
  };
  const profile: Profiles = Object.assign(new Profiles(), {
    user_id: OWNER,
    user: account,
    display_name: 'Alex',
    avatar_url: 'https://example.test/avatar.png',
    bio: 'Jazz enthusiast',
    birth_date: '2000-02-29',
    phone: '+123456789',
    bio_visibility: Visibility.PUBLIC,
    birth_date_visibility: Visibility.PUBLIC,
    phone_visibility: Visibility.PUBLIC,
    prefs_visibility: Visibility.PUBLIC,
    updated_at: new Date('2026-11-01T12:00:00Z'),
  });
  const preferences: MusicPreferences = Object.assign(new MusicPreferences(), {
    user_id: OWNER,
    user: account,
    ...structuredClone(preferenceValues),
    updated_at: profile.updated_at,
  });
  const state = {
    profile: profile as Profiles | null,
    preferences: preferences as MusicPreferences | null,
    friendship: Object.assign(new Friendships(), {
      id: '44444444-4444-4444-8444-444444444444',
      requester_id: OWNER,
      addressee_id: FRIEND,
      status: FriendshipStatus.ACCEPTED,
    }) as Friendships | null,
  };
  const findOne = vi.fn(
    async (
      entity: unknown,
      options: { where: Record<string, any> | Record<string, any>[] },
    ) => {
      const row =
        entity === Profiles
          ? state.profile
          : entity === MusicPreferences
            ? state.preferences
            : entity === Friendships
              ? state.friendship
              : null;
      const alternatives = Array.isArray(options.where)
        ? options.where
        : [options.where];
      return row && alternatives.some((where) => matches(row, where))
        ? row
        : null;
    },
  );
  const manager: any = {
    findOne,
    transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
      callback(manager),
    ),
  };
  const profilesRepository = {
    create: vi.fn((value: unknown) => value),
    save: vi.fn(async (value: unknown) => value),
    findOne: vi.fn((options: { where: Record<string, any> }) =>
      findOne(Profiles, options),
    ),
  };
  const musicRepository = {
    findOneBy: vi.fn((where: Record<string, any>) =>
      findOne(MusicPreferences, { where }),
    ),
  };
  return {
    state,
    profile,
    preferences,
    manager,
    profilesRepository,
    musicRepository,
  };
}
