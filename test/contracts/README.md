# Authentication tests

Run the implemented behavior checks with:

```sh
npm test
```

The user/profile repository providers and controller guard dependencies are isolated in the unit tests. The tests cover duplicate account creation, persistence failure, profile ownership, rejected login, passing validated identity/device metadata, and refresh rejection. Existing auth, password hashing, and email-verification tests remain in the same suite.

Run tomorrow's HTTP contract checks separately:

```sh
npm run test:auth-contract
```

This command starts an ephemeral listener bound to 127.0.0.1 and closes it afterward. It does not load .env, contact SMTP, use a provider, or connect to PostgreSQL. It uses the actual AuthController, HeadersGuard, Passport JWT strategy and JWT guard when attached to routes. The AuthService persistence boundary is mocked and rate limiting is bypassed so security checks are not masked by unrelated throttling.

These are development acceptance checks, not skipped tests. They are excluded from the default unit command by their `.contract.ts` filenames and explicitly included by `vitest.config.auth-contract.ts`. A failure means the behavior still needs implementation; do not weaken assertions or mark cases skipped to make them pass.

The HTTP contracts require:

- `/api/v1/auth/me` rejects missing, malformed, expired, and incorrectly signed access tokens.
- `/api/v1/auth/delete` rejects anonymous/expired authentication without calling deletion.
- A signed-in account cannot pass another user's ID into deletion. The API may reject that target or ignore it and use the authenticated identity.
- `/api/v1/auth/logout` returns 204 for unknown/already-revoked token inputs.

The logout service stub only permits testing the route/status contract. The token labels do not simulate stored sessions. These tests do **not** yet establish successful `/me` response filtering, rejection of deleted users, actual logout revocation, token-family behavior, or PostgreSQL transactions. Add service/database tests alongside those implementations, using a dedicated disposable database. The unrelated starter `test/app.e2e-spec.ts` still requires database configuration and is not the full registration-to-logout acceptance flow.

Snapshot on October 28, 2026: default unit suite 49 passed; HTTP suite 2 passed / 7 failed. The seven failures were four missing `/me` cases (404), two missing logout cases (404), and a forged deletion target reaching the service. Refresh expiry/rotation checks already exist in `src/auth/auth.service.spec.ts`.

## Session-family verification (October 29, 2026)

Login creates a new family and initial token in one transaction. Refresh retains
used tokens, looks up JWTs by `jti`, and locks the family before rotating. Reuse
revokes the family, including the latest token. Logout uses the supplied refresh
JWT without requiring an access JWT and acquires the same family lock.

For an existing application database, run
`migrations/20261029_refresh_families.sql` before starting the updated application.
The migration retains legacy token rows but revokes sessions whose JWT IDs were
never stored; those users must sign in again. It has not been applied to the
application database by these tests.

Run `npm run test:auth-db` with `AUTH_TEST_DB_HOST` pointing at a disposable
PostgreSQL server; optional settings are `AUTH_TEST_DB_PORT`, `AUTH_TEST_DB_USER`,
and `AUTH_TEST_DB_PASSWORD`. The supplied account needs permission to create a
database. The command builds the backend, creates a uniquely named test database,
and drops that database afterward. It does not load `.env`.

This suite exercises legacy migration, multiple devices/repeated logins, token
history, reuse revocation, logout with rotated tokens, simultaneous refreshes,
refresh versus logout, concurrent new login, transaction rollback, and user-delete
cascades using real PostgreSQL. Password hashing is stubbed in this database suite;
the separate password hashing unit tests exercise the actual implementation.

## Day 3: Google OAuth acceptance (October 31, 2026)

Run only the new OAuth checks:

```sh
npm run test:auth-contract -- oauth
```

There are **44 cases**: 19 Google strategy/profile/state cases, 18 account and
session cases, 4 callback HTTP cases, and 3 browser-cookie state cases. They are active acceptance tests; none
are skipped. The default `npm test` command does not include contract files.

The checks follow the Google authorization-code/Passport flow currently being
implemented in this repository. Facebook is not required for this milestone.
The subject requires social authentication; the precise fields and error codes
below are the project's implementation contract, not quotations from the subject.

Implementation contract:

- Google strategy produces a trusted principal with `id` (stable Google subject),
  `email`, `email_verified: true`,
  and optional display information. Google credentials stay out of this principal.
- Missing identity or unverified email: 401 `OAUTH_INVALID`. Missing email:
  422 `OAUTH_EMAIL_MISSING`. Missing photos or structured names must not crash login.
- Authorization generates a different state for each attempt. Missing or mismatched
  state is rejected before code exchange. A valid state can be consumed only once.
- `AuthService.oauth(req)` receives the trusted `req.user` and validated
  identity only; it never takes an account identity from the request body.
  The browser callback has no device headers and creates sessions with a null device ID.
- New accounts persist a null password, verified email, profile and provider
  identity in `google_accounts`. Identity fields are `google_user_id` and the
  `users_id` relation mapped to SQL `user_id`.
  User/profile/identity creation must roll back together on failure.
- Returning users are identified by provider subject, including when their Google
  email changes. Matching email alone cannot link accounts: return 409
  `LINK_REQUIRED` and require the authenticated Day 4 linking flow.
- Successful sign-in returns `access_token`, `refresh_token`, `expires_in`,
  and `is_new_user`
  via the controller after `oauth()` returns the committed local user ID. Tokens
  use the existing refresh-family system, including rotation and logout-all.
  Session writes roll back on failure; account creation commits separately.
- `/me` reports `has_password: false` and `linked_providers: ['google']` for a
  Google-only account. The callback returns the login response and propagates
  service errors; both Google routes retain the Passport guard.

Test boundaries:

- Provider tests use the real strategy and Passport state machinery, replacing
  the token exchange at the network boundary. They never contact Google.
- Account tests use the real AuthService, RefreshTokenService and signed JWTs,
  with a transactional in-memory persistence adapter and a fake password hasher.
  Extend that adapter if repository APIs change; preserve the behavior assertions.
- HTTP tests use the real OAuthController, override the provider guard to inject
  a trusted identity or reject it, mock AuthService, and bypass rate limiting.
  Browser-cookie tests separately exercise the actual OAuth session middleware
  and Passport strategy, stopping at the code-exchange network boundary.
- Real Google consent/code exchange, client credentials, deployed callback/device
  context, and PostgreSQL migrations/unique constraints/concurrent first sign-ins
  still require integration verification. Day 4 link/unlink is a separate milestone.
