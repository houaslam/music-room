# Music Room Day One Status Report

Date: October 29, 2026. Scope: the detailed Day 1 authentication checklist and the outstanding tasks from the previous review. This report describes the current local working tree, including uncommitted changes.

**Day 1 remains open.** The main APIs exist, and the error envelope has been corrected. The latest changes add a user lookup and dummy-password handling, but both need corrections. Test fixtures also need updating for those new dependencies. Do not treat the earlier green test counts as the current result.

## Verification results

| Check | Current result | Meaning |
|---|---|---|
| `npm test -- --reporter=dot` | 46 passed, 11 failed; 10 files passed, 1 failed | All 11 credential-validation failures occur during setup because the password-hasher mock has no `hash` method. Those assertions have not run successfully against this revision. |
| `npm run test:auth-contract -- --reporter=dot` | 10 passed, 1 failed | The signed-in deletion test receives 401 because the JWT strategy fixture is missing its newly required repository. This is a test wiring failure, not proof that deletion authorization regressed. |
| `tsc --noEmit --incremental false` | Failed | `test/contracts/auth-next.contract.ts:44` constructs `JWTStrategy` with one argument; it now requires two. |
| `npm run build` | Passed | Production sources compile. The production build excludes the test files that fail the full typecheck. |
| Deleted-user reproduction | Failed security requirement | With a repository whose lookup resolves to `null`, `JWTStrategy.validate` still returns the supplied user ID. |
| Local database role permission check | Cannot create databases | The configured role still cannot run the disposable-database integration suite. No privilege changes were made. |
| Full PostgreSQL account acceptance flow | Not verified | Existing suite starts with an already-verified user; it is not the complete registration-to-logout path. |
| Mobile demonstration | Not verified in this checkout | `mobile/` still has no application source available here. This does not establish what exists in your friend's repository. |

The SMTP error printed by the unit run comes from an intentional mocked delivery-failure case; it is not evidence of an attempted real email delivery failure.

## Completed work to retain

- Protected deletion derives the target from `req.user` rather than trusting a user ID from the request body.
- `/auth/me` uses an explicit response containing account identity and status rather than returning the full user entity. `linked_providers` remains an empty placeholder.
- JWT verification rejects invalid signatures and expired access tokens. The guard now returns the documented nested error format for rejected authentication.
- Logout verifies refresh claims and the stored hash before revoking the matching family. It does not require a live access token.
- Independent session families, token history, refresh replay revocation, and family-level transaction locking remain implemented.
- The API contract now marks more implemented endpoints with checkmarks. Planned status and several remaining limitations still need explicit documentation.

These implementation observations do not replace the missing database and device acceptance checks.

## Tasks left in execution order

### 1 Fix the awaited account lookup

**Priority: P2. Owner: backend.**

Source: [JWT strategy](../src/auth/strategies/jwt.strategy.ts), lines 23-29.

`findOne()` returns a Promise. The current code assigns that Promise to `findUser` and checks its truthiness before it resolves. The check therefore does not reject a deleted account. An isolated reproduction with `findOne: async () => null` returned the subject UUID instead of rejection.

- [ ] Make `validate` asynchronous and await the repository lookup.
- [ ] Require a valid UUID subject before querying the UUID column; reject missing or malformed subjects through normal authentication rejection.
- [ ] Return the authenticated identity only when the account exists.
- [ ] Add tests for existing, deleted, missing-subject, and malformed-subject accounts.

**Done when:** a deleted account's otherwise valid unexpired token returns 401 on both `/auth/me` and `/auth/delete`, and the deletion service is never called for it.

### 2 Correct the dummy password comparison

**Priority: P2. Owner: backend.**

Source: [Auth service](../src/auth/auth.service.ts), lines 37-61.

The constructor precomputes a dummy hash, but `dummyHash()` hashes that stored hash again on every unknown-email attempt before verifying it. Known-account requests perform password verification; unknown-account requests perform an additional expensive hash plus verification. The branches still differ in work, and unknown requests are unnecessarily expensive. This is a static finding, not a timing benchmark.

- [ ] Reuse the precomputed dummy hash directly in the password verification call.
- [ ] Do not generate a new password hash for each unknown-email request.
- [ ] Keep the same generic credentials error for unknown email and wrong password.
- [ ] Verify the expected hashing/verification call pattern in tests without asserting exact wall-clock timing.

**Done when:** both branches perform the intended password-verification work, unknown credentials still return 401, and per-attempt dummy rehashing is removed.

### 3 Restore the unit and HTTP test fixtures

**Priority: P2. Owner: test maintenance.**

Sources: [Credential validation tests](../src/auth/auth.validation.spec.ts), lines 37-59; [HTTP contract tests](../test/contracts/auth-next.contract.ts), lines 40-44.

- [ ] Supply a `hash` mock in the credential-validation fixture because AuthService now initializes a dummy hash in its constructor.
- [ ] Update the unknown-user assertion: it currently expects no verification call, which contradicts the newly required dummy verification behavior.
- [ ] Supply the Users repository when constructing JWTStrategy in the HTTP suite.
- [ ] Make the repository fixture return an existing owner for valid-owner tests and `null` for deleted-owner tests. Do not bypass the JWT strategy to hide the issue.
- [ ] Assert the nested authentication error body, not only status 401.
- [ ] Add a successful `/auth/me` HTTP case and assert its exact safe response fields.
- [ ] Rerun the unit suite, HTTP suite, and full TypeScript check.

**Done when:** all three commands pass with meaningful assertions. Do not merely accept 401 in the valid-owner deletion test: that would hide broken authentication setup and stop testing forged-target handling.

### 4 Reconcile remaining login guarantees with the contract

**Priority: P2. Owner: backend and API documentation.**

Source: [API contract](../auth_api_contract.md), login section; [Auth service](../src/auth/auth.service.ts), `validateUser` and `recordFailedLogin`.

Unknown emails now enter dummy comparison, but they still do not enter attempted-email lockout tracking. Existing-account counters use the user's row. The contract also promises `login_attempts` records and device upserts that are not implemented by this login flow.

- [ ] Implement the promised attempted-email policy, or explicitly document it as pending and describe the protection that actually exists.
- [ ] Distinguish storing a device ID on a session from upserting a complete device record.
- [ ] Document current status for attempt logs, device persistence, and rate limits rather than leaving stronger guarantees in the reference.

**Done when:** the reference matches the running behavior and tests cover whichever policy is adopted. Changing documentation alone does not implement the stronger protection.

### 5 Unblock and complete PostgreSQL acceptance

**Priority: verification blocker. Owner: test environment and test maintenance.**

Source: [Database scenarios](../test/auth-sessions.integration.mjs), especially the direct user creation and service login at lines 99-105.

- [ ] Configure a dedicated disposable PostgreSQL environment or test role that can create and remove its test database. Keep application-role privileges unchanged unless separately intended.
- [ ] Run the existing migration, session, concurrency, replay, rollback, and cascade scenarios successfully.
- [ ] Add the real flow: registration, captured test verification email/code, confirmation, password login, `/auth/me`, refresh, logout, then rejected refresh.
- [ ] Verify registration creates both user and profile records.
- [ ] Force profile creation failure and prove the user creation rolls back too.
- [ ] Include actual password hashing in the account acceptance path; the existing session suite intentionally substitutes a test hasher.

**Done when:** the database suite passes and the complete account flow has repeatable evidence. At this review the role permission check still returned `can_create_test_database: false`; database correctness remains unverified.

### 6 Finish implementation status documentation

**Priority: P2. Owner: API documentation.**

Source: [API contract](../auth_api_contract.md).

- [ ] Add an explicit status legend, such as implemented / stub / planned; lack of a checkmark is too ambiguous for integration.
- [ ] Mark OAuth and logout-all as planned while they remain unavailable.
- [ ] Document that `/auth/me.linked_providers` is temporarily always `[]`.
- [ ] Describe the password-reset endpoints as stubs until their actual behavior exists.

**Done when:** your friend can identify usable routes without inspecting backend source.

### 7 Do not report successful password recovery from empty handlers

**Priority: P2. Owner: backend. Scope: follow-up authentication work, not a reason to expand Day 1.**

Source: [Auth controller](../src/auth/auth.controller.ts), lines 86-92.

Both newly added password-reset methods have empty bodies and return 204. They send no recovery email and change no password. The reset-request contract specifies 202, so even the declared status differs.

- [ ] Until recovery is implemented, remove the exposed success stubs or return an explicit unavailable/not-implemented response and document it.
- [ ] When implementing recovery, add request and confirmation services, expiry/one-use enforcement, session revocation, and tests before claiming completion.

**Done when:** unfinished recovery cannot appear to have succeeded. Full password recovery can remain on its scheduled later day.

### 8 Demonstrate the mobile account flow

**Priority: acceptance. Owners: both teammates.**

- [ ] Use a real phone against the actual backend with configurable API address and required device headers.
- [ ] Log in, display the account from `/me`, and confirm no sensitive internal fields are exposed.
- [ ] Log out, clear local tokens, and confirm the old refresh token is rejected.
- [ ] Record where the frontend source lives if it remains outside this checkout.

**Done when:** the two-person integration is demonstrated, not only independently implemented or mocked.

## Optional cleanup

The registered but unused [RefreshTokenService](../src/auth/refresh-tokens.service.ts) still has a creation method missing the current required family/device/JWT-ID fields and a latest-token-per-user read method. Remove it or consolidate it with the new session model before future reuse. It is not a current live-path failure and should not displace the security fixes above.

## Day One completion gate

Close Day 1 after the awaited identity check and dummy comparison are correct, unit/HTTP/type checks pass again, the complete database account flow and phone demonstration are verified, and the contract accurately labels unfinished behavior. Do not add further authentication endpoints just to increase endpoint count before restoring this foundation.

This review added only this report. Production code and test implementations were not edited; the build regenerated ignored output during verification. No database privileges or application data were changed.
