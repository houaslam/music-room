import 'reflect-metadata';
import express, { type ErrorRequestHandler } from 'express';
import passport from 'passport';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { OauthStrategy } from '../../src/auth/strategies/oauth.strategy.js';
import { createOAuthSession } from '../../src/auth/session/oauth-session.js';
import type { OAuthRequest } from '../../src/auth/session/oauth-state.store.js';

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
    '/api/v1/auth/oauth/google/link',
    (req, _res, next) => {
      // Simulate the identity supplied by JWTGuard, without a live app token.
      (req as OAuthRequest).oauthIntent = {
        intent: 'link',
        appUserId: 'app-user',
      };
      next();
    },
    passport.authenticate('google', { session: false }),
  );
  app.get(
    '/api/v1/auth/oauth/google/callback',
    passport.authenticate('google', { session: false }),
  );
  app.use(((_error, req, res, _next) =>
    res
      .status(502)
      .json({
        intent: (req as OAuthRequest).verifiedOAuthIntent,
      })) as ErrorRequestHandler);
  return { app, exchange };
}

describe('Google OAuth browser state', () => {
  it('preserves separate intents through real cookie redirects and rejects link replay', async () => {
    const { app } = setup();
    const browser = request.agent(app);
    const link = await browser
      .get('/api/v1/auth/oauth/google/link')
      .expect(302);
    const login = await browser.get('/api/v1/auth/oauth/google').expect(302);
    const callback = (response: { headers: Record<string, string> }) =>
      `/api/v1/auth/oauth/google/callback?code=test-code&state=${new URL(response.headers.location).searchParams.get('state')}`;
    const loginResult = await browser.get(callback(login)).expect(502);
    expect(loginResult.body.intent).toEqual({ intent: 'login' });
    const linkResult = await browser.get(callback(link)).expect(502);
    expect(linkResult.body.intent).toEqual({
      intent: 'link',
      appUserId: 'app-user',
    });
    await browser.get(callback(link)).expect(403);
  });

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
