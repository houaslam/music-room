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
