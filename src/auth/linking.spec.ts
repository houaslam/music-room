import { QueryFailedError } from 'typeorm';
import { OAuthService } from './oauth.service.js';
import { OAuthController } from './oauth.controller.js';
import { GoogleAccounts } from './entities/google-accounts.entity.js';
import { Users } from '../user/entities/user.entity.js';
import {
  OAuthStateStore,
  type OAuthRequest,
} from './session/oauth-state.store.js';

const google = {
  id: 'google-1',
  email: 'google@example.test',
  email_verified: true as const,
  name: 'Test',
  photo: null,
};

describe('OAuth callback routing', () => {
  it('logs in normally without a session in the controller test harness', async () => {
    const auth = {
      oauth: vi.fn().mockResolvedValue({ id: 'app-1', is_new_user: false }),
      login: vi.fn().mockResolvedValue({ access_token: 'app-token' }),
      link: vi.fn(),
    };
    const controller = new OAuthController(auth as never, auth as never);
    await expect(
      controller.googleCallback({ user: google }),
    ).resolves.toMatchObject({ access_token: 'app-token' });
    expect(auth.link).not.toHaveBeenCalled();
  });

  it('links using the verified app identity and callback Google profile without logging in', async () => {
    const auth = {
      link: vi.fn().mockResolvedValue(undefined),
      oauth: vi.fn(),
      login: vi.fn(),
    };
    const controller = new OAuthController(auth as never, auth as never);
    const req = {
      verifiedOAuthIntent: { intent: 'link', appUserId: 'app-1' },
      user: google,
    };
    await expect(controller.googleCallback(req)).resolves.toEqual({
      message: 'Google account linked successfully',
    });
    expect(auth.link).toHaveBeenCalledWith('app-1', google);
    expect(auth.oauth).not.toHaveBeenCalled();
    expect(auth.login).not.toHaveBeenCalled();
    expect(req).not.toHaveProperty('verifiedOAuthIntent');
  });
});

describe('OAuth intent binding', () => {
  it('keeps overlapping login and link attempts separate and rejects replay', () => {
    const store = new OAuthStateStore();
    const session = {};
    const link = {
      session,
      oauthIntent: { intent: 'link', appUserId: 'app-1' },
    } as OAuthRequest;
    const login = { session } as OAuthRequest;
    const savedLink = vi.fn();
    const savedLogin = vi.fn();
    store.store(link, savedLink);
    store.store(login, savedLogin);
    const loginDone = vi.fn();
    store.verify(login, savedLogin.mock.calls[0][1], loginDone);
    expect(login.verifiedOAuthIntent).toEqual({ intent: 'login' });
    const callback = { session } as OAuthRequest;
    const linkDone = vi.fn();
    store.verify(callback, savedLink.mock.calls[0][1], linkDone);
    expect(callback.verifiedOAuthIntent).toEqual({
      intent: 'link',
      appUserId: 'app-1',
    });
    const replay = vi.fn();
    store.verify(callback, savedLink.mock.calls[0][1], replay);
    expect(replay.mock.calls[0][1]).toBe(false);
    expect(callback.verifiedOAuthIntent).toBeUndefined();
  });

  it('rejects expired intent', () => {
    const store = new OAuthStateStore();
    const req = { session: {} } as OAuthRequest;
    const saved = vi.fn();
    store.store(req, saved);
    const state = saved.mock.calls[0][1];
    req.session.oauthAttempts![state].expiresAt = 0;
    const done = vi.fn();
    store.verify(req, state, done);
    expect(done.mock.calls[0][1]).toBe(false);
    expect(req.verifiedOAuthIntent).toBeUndefined();
  });
});

describe('Google link service', () => {
  function setup() {
    const manager = {
      findOne: vi.fn(async (entity: unknown) =>
        entity === Users
          ? { id: 'app-1', email: 'different@example.test' }
          : null,
      ),
      save: vi.fn().mockResolvedValue({}),
    };
    const outer = {
      transaction: vi.fn(async (callback: (m: unknown) => unknown) =>
        callback(manager),
      ),
      findOne: vi.fn(),
    };
    const service = new OAuthService(outer as never);
    return { service, manager, outer };
  }

  it('saves a verified Google identity even when emails differ', async () => {
    const { service, manager } = setup();
    await service.link('app-1', google);
    expect(manager.save).toHaveBeenCalledWith(GoogleAccounts, {
      users_id: { id: 'app-1' },
      google_user_id: google.id,
    });
  });

  it.each([
    ['app-1', 'PROVIDER_ALREADY_LINKED'],
    ['another-user', 'PROVIDER_IDENTITY_IN_USE'],
  ])('rejects an identity owned by %s', async (owner, code) => {
    const { service, manager } = setup();
    manager.findOne.mockResolvedValueOnce({ users_id: { id: owner } } as never);
    await expect(service.link('app-1', google)).rejects.toMatchObject({
      response: { error: { code } },
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects linking a second Google identity to the same app user', async () => {
    const { service, manager } = setup();
    manager.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'app-1' } as never)
      .mockResolvedValueOnce({ id: 'existing-link' } as never);
    await expect(service.link('app-1', google)).rejects.toMatchObject({
      response: { error: { code: 'PROVIDER_ALREADY_LINKED' } },
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([
    ['another-user', 'PROVIDER_IDENTITY_IN_USE'],
    ['app-1', 'PROVIDER_ALREADY_LINKED'],
    [null, 'PROVIDER_ALREADY_LINKED'],
  ])(
    'maps a concurrent unique violation after rollback (%s)',
    async (owner, code) => {
      const { service, manager, outer } = setup();
      manager.save.mockRejectedValue(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('duplicate'), { code: '23505' }),
        ),
      );
      outer.findOne
        .mockResolvedValueOnce(owner ? { users_id: { id: owner } } : null)
        .mockResolvedValueOnce({ id: 'winning-link' });
      await expect(service.link('app-1', google)).rejects.toMatchObject({
        response: { error: { code } },
      });
      expect(outer.findOne).toHaveBeenCalled();
    },
  );

  it('preserves unrelated database failures', async () => {
    const { service, manager, outer } = setup();
    const error = new Error('database unavailable');
    manager.save.mockRejectedValue(error);
    await expect(service.link('app-1', google)).rejects.toBe(error);
    expect(outer.findOne).not.toHaveBeenCalled();
  });
});
