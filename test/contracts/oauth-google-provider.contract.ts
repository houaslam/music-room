import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { OauthStrategy } from '../../src/auth/strategies/oauth.strategy.js';

// No Google calls or real credentials: exercise the profile boundary AFTER
// Passport has exchanged the authorization code with Google.
describe('Day 3 Google verified-profile contract', () => {
  const config = {
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    // Current implementation misspells this key; remove after fixing config.
    GOOGLE_CLIENT_SECRECT: 'test-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost/auth/oauth/google/callback',
  };
  const profile = () => ({
    provider: 'google',
    id: 'google-stable-subject-123',
    displayName: 'Ada Lovelace',
    name: { givenName: 'Ada', familyName: 'Lovelace' },
    emails: [{ value: 'ada@example.test', verified: true }],
    photos: [{ value: 'https://example.test/avatar.png' }],
    _json: { sub: 'google-stable-subject-123', email_verified: true },
  });

  // Exercise Passport's actual state machinery. The token exchange is replaced
  // at the network boundary; no authorization code ever reaches Google.
  function browserFlow() {
    const strategy: any = new OauthStrategy(new ConfigService(config));
    const exchange = vi.fn((_code, _params, callback) =>
      callback(new Error('test stops at token exchange')),
    );
    strategy._oauth2.getOAuthAccessToken = exchange;
    const session = {};
    const authenticate = (query: Record<string, string>) =>
      new Promise<{ location?: string; failed?: boolean; error?: unknown }>(
        (resolve) => {
          strategy.redirect = (location: string) => resolve({ location });
          strategy.fail = () => resolve({ failed: true });
          strategy.error = (error: unknown) => resolve({ error });
          strategy.success = () => resolve({});
          strategy.authenticate(
            { query, session, headers: {}, method: 'GET' },
            {},
          );
        },
      );
    return { authenticate, exchange };
  }

  it('generates a distinct state for each authorization attempt', async () => {
    const first = await browserFlow().authenticate({});
    const second = await browserFlow().authenticate({});
    expect(first.location).toBeDefined();
    expect(second.location).toBeDefined();
    const a = new URL(first.location!).searchParams.get('state');
    const b = new URL(second.location!).searchParams.get('state');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it.each(['missing', 'mismatched'])(
    'rejects %s callback state before exchanging a code',
    async (kind) => {
      const flow = browserFlow();
      await flow.authenticate({});
      const result = await flow.authenticate({
        code: 'test-code',
        ...(kind === 'mismatched' ? { state: 'forged' } : {}),
      });
      expect(result.failed || Boolean(result.error)).toBe(true);
      expect(flow.exchange).not.toHaveBeenCalled();
    },
  );

  it('consumes a valid state once and rejects replay before a second code exchange', async () => {
    const flow = browserFlow();
    const start = await flow.authenticate({});
    expect(start.location).toBeDefined();
    const state = new URL(start.location!).searchParams.get('state');
    expect(state).toBeTruthy();
    await flow.authenticate({ code: 'first-code', state: state! });
    expect(flow.exchange).toHaveBeenCalledTimes(1);
    const replay = await flow.authenticate({
      code: 'second-code',
      state: state!,
    });
    expect(replay.failed || Boolean(replay.error)).toBe(true);
    expect(flow.exchange).toHaveBeenCalledTimes(1);
  });

  async function validate(value: unknown) {
    const strategy = new OauthStrategy(new ConfigService(config));
    const done = vi.fn();
    let thrown: unknown;
    try {
      await (strategy as any)._verify(
        'google-access-secret',
        'google-refresh-secret',
        value,
        done,
      );
    } catch (error) {
      thrown = error;
    }
    // Passport consumes done(error, user), not the return value of validate.
    const error = thrown ?? done.mock.calls.find(([err]) => err)?.[0];
    const user = done.mock.calls.find(([err, user]) => !err && user)?.[1];
    return { error, user, done };
  }

  it('retains the stable Google subject and provider for identity lookup', async () => {
    const result = await validate(profile());
    expect(result.error).toBeUndefined();
    expect(result.user).toMatchObject({
      id: 'google-stable-subject-123',
      email: 'ada@example.test',
      email_verified: true,
    });
    expect(result.done).toHaveBeenCalledTimes(1);
  });

  it('does not expose Google access or refresh tokens in the application principal', async () => {
    const { user, error } = await validate(profile());
    expect(error).toBeUndefined();
    expect(user).toBeDefined();
    expect(JSON.stringify(user)).not.toContain('google-access-secret');
    expect(JSON.stringify(user)).not.toContain('google-refresh-secret');
  });

  it.each([
    ['missing subject', { ...profile(), id: undefined, _json: {} }],
    ['empty subject', { ...profile(), id: '', _json: {} }],
    ['missing profile', undefined],
    ['wrong provider', { ...profile(), provider: 'facebook' }],
  ])('rejects %s with OAUTH_INVALID', async (_label, value) => {
    const { error, user } = await validate(value);
    expect(error).toMatchObject({
      status: 401,
      response: { error: { code: 'OAUTH_INVALID' } },
    });
    expect(user).toBeUndefined();
  });

  it.each([
    ['missing emails', { ...profile(), emails: undefined }],
    ['empty emails', { ...profile(), emails: [] }],
    [
      'empty address',
      { ...profile(), emails: [{ value: '', verified: true }] },
    ],
  ])('rejects %s with OAUTH_EMAIL_MISSING', async (_label, value) => {
    const { error, user } = await validate(value);
    expect(error).toMatchObject({
      status: 422,
      response: { error: { code: 'OAUTH_EMAIL_MISSING' } },
    });
    expect(user).toBeUndefined();
  });

  it.each([false, undefined])(
    'rejects an email without positive verification (%s)',
    async (verified) => {
      const value = {
        ...profile(),
        emails: [{ value: 'ada@example.test', verified }],
        _json: {},
      };
      const { error, user } = await validate(value);
      expect(error).toMatchObject({
        status: 401,
        response: { error: { code: 'OAUTH_INVALID' } },
      });
      expect(user).toBeUndefined();
    },
  );

  it.each([
    ['no photo', { ...profile(), photos: [] }],
    ['missing photos', { ...profile(), photos: undefined }],
    ['no structured name', { ...profile(), name: undefined }],
    ['partial name', { ...profile(), name: { givenName: 'Ada' } }],
  ])('accepts optional profile data: %s', async (_label, value) => {
    const { user, error } = await validate(value);
    expect(error).toBeUndefined();
    expect(user).toMatchObject({ email: 'ada@example.test' });
    expect(JSON.stringify(user)).not.toMatch(/undefined|null_null/);
  });
});
