import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import 'express-session';
import type {
  StateStoreStoreCallback,
  StateStoreVerifyCallback,
} from 'passport-oauth2';

export type OAuthIntent =
  { intent: 'login' } | { intent: 'link'; appUserId: string };

interface Attempt {
  intent: OAuthIntent;
  expiresAt: number;
}

declare module 'express-session' {
  interface SessionData {
    oauthAttempts?: Record<string, Attempt>;
  }
}

export interface OAuthRequest extends Request {
  oauthIntent?: OAuthIntent;
  verifiedOAuthIntent?: OAuthIntent;
}

// Keep intent alongside each random state, so login and link attempts cannot
// accidentally consume each other's identity, even in different browser tabs.
export class OAuthStateStore {
  store(req: OAuthRequest, done: StateStoreStoreCallback): void;
  store(req: OAuthRequest, meta: unknown, done: StateStoreStoreCallback): void;
  store(
    req: OAuthRequest,
    metaOrDone: unknown,
    callback?: StateStoreStoreCallback,
  ) {
    const done = callback ?? (metaOrDone as StateStoreStoreCallback);
    if (!req.session)
      return done(new Error('OAuth session is unavailable'), undefined);
    const attempts = (req.session.oauthAttempts ??= {});
    for (const [state, attempt] of Object.entries(attempts)) {
      if (attempt.expiresAt <= Date.now()) delete attempts[state];
    }
    // Bound the amount of temporary data held by a browser session.
    if (Object.keys(attempts).length >= 10) {
      return done(new Error('Too many pending OAuth attempts'), undefined);
    }
    const state = randomBytes(32).toString('hex');
    attempts[state] = {
      intent: req.oauthIntent ?? { intent: 'login' },
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    done(null, state);
  }

  verify(
    req: OAuthRequest,
    state: string,
    done: StateStoreVerifyCallback,
  ): void;
  verify(
    req: OAuthRequest,
    state: string,
    meta: unknown,
    done: StateStoreVerifyCallback,
  ): void;
  verify(
    req: OAuthRequest,
    state: string,
    metaOrDone: unknown,
    callback?: StateStoreVerifyCallback,
  ) {
    const done = callback ?? (metaOrDone as StateStoreVerifyCallback);
    delete req.verifiedOAuthIntent;
    const attempts = req.session?.oauthAttempts;
    const attempt =
      typeof state === 'string' && attempts && Object.hasOwn(attempts, state)
        ? attempts[state]
        : undefined;
    if (!attempt) {
      return done(null, false, {
        message: 'Unable to verify authorization request state.',
      });
    }
    delete attempts![state];
    if (attempt.expiresAt <= Date.now()) {
      return done(null, false, {
        message: 'Authorization request state has expired.',
      });
    }
    req.verifiedOAuthIntent = attempt.intent;
    done(null, true, undefined);
  }
}
