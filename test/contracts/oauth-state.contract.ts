import 'reflect-metadata';
import express, { type ErrorRequestHandler } from 'express';
import passport from 'passport';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { OauthStrategy } from '../../src/auth/strategies/oauth.strategy.js';
import { createOAuthSession } from '../../src/auth/oauth-session.js';

// Exercise real browser cookies and Passport state verification. Stop before
// any request to Google; these tests use neither credentials nor a database.
function setup() {
  const config = new ConfigService({
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost/api/v1/auth/oauth/google/callback',
    OAUTH_SESSION_SECRET: 'local-test-session-secret',
  });
  const strategy: any = new OauthStrategy(config);
  const exchange = vi.fn((_code, _params, done) =>
    done(new Error('stop before Google')),
  );
  strategy._oauth2.getOAuthAccessToken = exchange;
  const app = express();
  app.use('/api/v1/auth/oauth', createOAuthSession(config));
  app.use(passport.initialize());
  app.get(
    '/api/v1/auth/oauth/google',
    passport.authenticate('google', { session: false }),
  );
  app.get(
    '/api/v1/auth/oauth/google/callback',
    passport.authenticate('google', { session: false }),
  );
  app.use(((_error, _req, res, _next) =>
    res.status(502).end()) as ErrorRequestHandler);
  return { app, exchange };
}

describe('Google OAuth browser state', () => {
  it('binds state to the initiating browser and consumes it on callback', async () => {
    const { app, exchange } = setup();
    const browser = request.agent(app);
    const start = await browser.get('/api/v1/auth/oauth/google').expect(302);
    const state = new URL(start.headers.location).searchParams.get('state');
    expect(state).toBeTruthy();
    expect(start.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(start.headers['set-cookie'][0]).toContain('SameSite=Lax');
    const callback = `/api/v1/auth/oauth/google/callback?code=test-code&state=${state}`;

    // A different browser cannot use the first browser's authorization state.
    await request(app).get(callback).expect(403);
    expect(exchange).not.toHaveBeenCalled();

    await browser.get(callback).expect(502);
    expect(exchange).toHaveBeenCalledTimes(1);
    await browser.get(callback).expect(403);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it.each(['missing', 'forged'])(
    'rejects %s state before contacting Google',
    async (kind) => {
      const { app, exchange } = setup();
      const browser = request.agent(app);
      await browser.get('/api/v1/auth/oauth/google').expect(302);
      await browser
        .get(
          `/api/v1/auth/oauth/google/callback?code=test-code${kind === 'forged' ? '&state=forged' : ''}`,
        )
        .expect(403);
      expect(exchange).not.toHaveBeenCalled();
    },
  );
});
