# Music Room daily delivery plan

Build Music Room with two people: Hajar owns the NestJS backend and your friend owns the mobile frontend. Start Thursday October 29, 2026. Aim for a complete, tested mandatory submission on Wednesday December 9. Keep December 10 to 16 for evaluation, corrections, or blocked integrations. This leaves the rest of the RNCP roadmap available before September 2027.

Budget **6 focused hours per person per working day, six days per week**, with Sundays off. The core plan is 36 working days: 216 hours each, 432 team hours. The six buffer days add at most 36 hours each. These are remaining-work planning budgets, not measured estimates or a guarantee of validation. If either person has fewer hours available, keep the task order and move dates rather than compressing testing.

## Scope and decisions

The supplied subject is Music Room version 6. Implement **Music Track Vote and Music Playlist Editor**, the two services already represented in `music-room.sql`. V.2 explicitly requires at least two of the three services. Defer Music Control Delegation and all bonuses until the mandatory checklist passes. V.7 mentions load for three services; confirm with your evaluator on Day 1 how to report load for the two selected services, rather than assuming a third implementation is required.

Deliver one mobile platform first. Day 1 decides Android or iOS from the devices both teammates can actually test. Keep the API address configurable. Use **Google OR Facebook**, not both, for social sign-in and linking an existing account. Use one music provider; validate its actual SDK/API access and playback constraints on Day 2. A mock catalog can unblock UI development, but is not the acceptance demo. The SDK must not implement your collaboration, permissions, voting, or queue logic for you.

Choose the smallest subject-compliant behavior: one reliable playback device for an event, deterministic vote ties, server-owned playlist ordering, and authoritative server state after reconnect. Do not build synchronized audio on every phone, payments, IoT, offline editing, a web client, custom design systems, or microservices during these six weeks.

## Starting point in this checkout

- `src/auth/` and `src/email/` contain registration, OTP verification, login, token rotation, validation, and security-related tests. Treat these as existing implementation to finish and integrate, not work to rebuild.
- `src/user/user.controller.ts` and `src/profile/profile.controller.ts` expose no functional profile routes. Profile persistence exists but preferences, friends, visibility filtering, and the mobile flows still need implementation.
- `music-room.sql` describes friendships, playlists, events, votes, playback state, and action logs. Those SQL definitions do not mean the corresponding NestJS endpoints exist. Reconcile SQL and entity definitions before adding migrations.
- The refresh-token contract describes opaque tokens, device families, and replay revocation, while the implementation currently signs refresh JWTs and constrains sessions per user. Decide and document one coherent behavior; do not make the frontend implement a contract that the API does not provide.
- `mobile/` contains installed dependencies, local configuration, and Expo metadata, but no app source or package manifest in this checkout. Your friend should first recover an existing frontend from its actual repository/branch, if there is one, before scaffolding anything new.
- The README is a Nest starter README. The current e2e test is a Hello World smoke test rather than a subject acceptance suite. No project CI or setup automation was found in this inspection.
- Baseline on October 28: `npm test -- --reporter=dot` ran 42 tests: **39 passed, 3 failed**. Failures are dependency setup in `auth.controller.spec.ts` (throttler), `profile.service.spec.ts` (repository), and `user.service.spec.ts` (repository). Passing unit tests do not establish that the app works with PostgreSQL, email, a provider, or a phone.
- Existing uncommitted backend changes are in progress. Preserve them and review them before changing shared authentication behavior. This plan changes documentation only.

## Daily working rhythm

Each person's six-hour budget includes **4 hours implementation, 1 hour verification, 30 minutes integration with the other person, and 30 minutes documenting/reviewing the result**. Take breaks outside focused time. When a day is mainly testing, use the implementation block for reproducing and fixing failures.

At the start of the day, agree on request/response examples and the errors the frontend must handle. Your friend uses fixtures from that contract while you build the endpoint. At the end, replace the fixture with the real API and demonstrate the result on two independent sessions. Use real phones for OAuth, location, playback, and background behavior when those arrive in the plan.

A task is done when its behavior works, its relevant checks pass, its API contract is current, and the other person has reviewed it. Checking a box means demonstrated completion, not just code written. Keep one task in progress per person. Avoid parallel edits to authentication or shared contracts without a quick handoff.

If either owner is blocked for 30 minutes, record the blocker and work against the agreed fixture or independent tests. Do not let a mock-based UI milestone be mistaken for a working integration. If a milestone slips by more than two working days, spend buffer or revise the forecast immediately; do not remove mandatory scope or hide failing checks.

## Week 1 Foundations and working authentication

### Day 1 Thursday October 29

**Today's outcome:** You have a reliable starting point and a mobile app that reaches your backend. You know exactly which authentication behavior is already implemented and which work remains. Full login integration is scheduled for later days.

The tasks below are instructions for your team to execute. They have not been implemented by adding this plan. Use the hour labels as elapsed focused time from the start of your session; breaks are additional.

#### Shared kickoff from 0h00 to 0h30

- [ ] Confirm that Hajar owns `src/`, database changes, and backend tests; your friend owns mobile source and client tests. Agree on changes to `auth_api_contract.md` before either person relies on them.
- [ ] Confirm the mandatory scope: Track Vote + Playlist Editor, one mobile platform, one social provider, one music provider. Record these decisions in `docs/day-01-notes.md`; provider access is proved on Day 2.
- [ ] Pick the platform using actual available devices. Record the phone/OS each person will use, whether it is a real phone or simulator, and the planned two-session evaluation setup.
- [ ] Record a daily 30-minute integration time and a rule that either person raises a blocker after 30 minutes without progress.
- [ ] Ask campus staff or an evaluator how V.7 should be demonstrated for two selected services. Record the question and answer if available; waiting for a reply does not block today's work.

**Output:** A short decision list with owners, platform, mandatory services, provider candidates, and the next integration time. Do not spend the kickoff designing every screen or database table.

#### Your backend tasks from 0h30 to 6h00

##### B1 Review and preserve existing work from 0h30 to 1h00

- [ ] Run `git status --short` and `git diff --stat`. Review the changes in `src/auth/auth.service.ts`, `src/auth/auth.controller.ts`, `src/auth/entities/refresh-tokens.entity.ts`, and the added credential-validation tests.
- [ ] Write three lists in the day notes: implemented, partially implemented, and absent. Start with registration, verification, login, refresh, logout, password reset, OAuth, and profile routes.
- [ ] Record the starting commit and which existing files are uncommitted. Do not reset or replace these changes. If you make a checkpoint commit, review its exact contents first and include only intended files.
- [ ] Start the backend against your existing development database. If that fails, record the exact missing dependency/configuration and resolve it in B5 or B6. Do not run the full SQL file against a database containing valuable data.

**Done when:** You can explain the current authentication path and identify the work you are preserving. An implementation that exists is not automatically marked as working with a real database.

##### B2 Repair the three failing unit-test setups from 1h00 to 2h15

Run the focused baseline first:

```bash
npm test -- src/auth/auth.controller.spec.ts src/profile/profile.service.spec.ts src/user/user.service.spec.ts
```

- [ ] In `src/auth/auth.controller.spec.ts`, provide a controlled `AuthService` test double and override `HeadersGuard` and `RateLimitGuard` in the controller unit test. This isolates controller delegation from guard infrastructure. Do not remove the production guards to make the test pass.
- [ ] Give the service double the controller methods under test. For registration, return an agreed `{ user_id }` fixture and assert the controller forwards the DTO and returns the service result. Add one service-rejection propagation check. Other controller methods can be covered when their flows are integrated.
- [ ] In `src/profile/profile.service.spec.ts`, provide the `getRepositoryToken(Profiles)` dependency. Mock the repository operations used by `ProfileService.create`: `create` and `save`. Check that profile creation uses the supplied user ID and persists the display name.
- [ ] In `src/user/user.service.spec.ts`, provide `getRepositoryToken(Users)`. For `UserService.read`, mock `findOne` and check lookup by email plus the not-found result. Add other repository methods only when a test exercises them.
- [ ] Rerun the three files, then run `npm test -- --reporter=dot`. All existing tests should pass along with the new behavior checks. Do not delete tests or mark them skipped to obtain green output.

**Done when:** These tests compile their Nest modules and verify useful behavior without opening database or SMTP connections. Record the new full-suite counts and any unrelated failure separately. Guard behavior still needs its own integration/security checks later; overriding it in a controller unit test does not verify it.

##### B3 Make the frontend authentication contract usable from 2h15 to 3h15

Compare `auth_api_contract.md` with the controller, service, DTOs, and entities. Add an implementation-status table to the contract or day notes. For each route, record method/path, request fields, success response/status, relevant error codes, current implementation status, and target delivery day.

| Route to audit | Evidence to inspect | Question to resolve today |
|---|---|---|
| `POST /api/v1/auth/register` | Controller, registration DTO, `AuthService.register` | Does the actual response match `{ user_id }` and are required fields correct? |
| `POST /api/v1/auth/email-verification` | Controller and email-verification service | Is resend implemented, and does it use the documented status and neutral response? |
| `POST /api/v1/auth/email-verification/confirm` | Confirmation DTO and service | Are email, six-digit code, expiry, attempts, and error codes consistent? |
| `POST /api/v1/auth/login` | Controller, login DTO, service | Are headers, token fields, verification checks, and account-lock errors documented accurately? |
| `POST /api/v1/auth/refresh` | Service and refresh entity | What is implemented today versus planned for device sessions, rotation, and replay handling? |
| Logout, reset, OAuth, and `auth/me` | Controller and registered modules | Which routes are absent? Mark them pending rather than implying the client can already call them. |

- [ ] Record the exact four client headers from `headers-validation.dto.ts`: `X-Platform`, `X-Device-Model`, `X-App-Version`, and `X-Device-Id`. The version must currently be three numeric parts, and the device ID must be a UUID.
- [ ] Resolve the refresh-token design decision with your friend: keep signed JWT refresh tokens or implement opaque refresh tokens later. Either can be documented, but identify the remaining session-family/replay work; do not present those protections as already complete.
- [ ] Prepare non-sensitive fixtures for registration success, validation failure, invalid credentials, unverified email, and token expiry. Share them as JSON examples in the contract or a small agreed fixture file.
- [ ] Define what the client may build now using fixtures and what must wait for live integration. Keep the backend URL in one place on the client.

**Done when:** Your friend can build forms and error states without guessing payloads. Each route is explicitly marked implemented/unverified, verified, or pending. Contract changes do not silently promise features that are missing.

##### B4 Map database differences from 3h15 to 4h00

- [ ] Compare `music-room.sql` with `Users`, `Profiles`, `EmailTokens`, and `RefreshTokens` entity definitions and their current usage.
- [ ] Record the per-user unique refresh-session constraint, and that `family_id` and `device_id` currently lack persistence column decorators in the inspected refresh entity. Record the effect on the intended multi-device design.
- [ ] Record verification-token fields used by code but absent or different in the SQL, including attempts and delivery status. Compare login counters/window fields in the user entity with the SQL design.
- [ ] Inspect how `AppModule` reads database configuration and uses `synchronize: true`. Confirm the port variable name expected by code, including the current `DB_POST` spelling. Do not copy environment values into notes or chat.
- [ ] Choose a canonical migration direction and record the Day 2/3 changes needed. Use a disposable database for migration work. Keep this block to analysis and the minimum correction needed to start locally; do not redesign all service tables today.

**Done when:** There is a concrete discrepancy list with affected files and planned corrections, rather than an assumption that applying the SQL and enabling entity synchronization are interchangeable.

##### B5 Provide a small connectivity endpoint from 4h00 to 4h45

- [ ] Add or verify a read-only `GET /api/v1/health` endpoint using the actual bootstrap prefix. Suggested response: `{ "status": "ok", "service": "music-room" }` with HTTP 200.
- [ ] Keep the connectivity endpoint free of user data, secrets, login requirements, and client-header requirements. Do not disable guards on authentication routes to make this endpoint accessible.
- [ ] Ensure the backend starts with the existing local development database. Resolve configuration/startup errors; keep full setup automation and migrations assigned to Day 2/3.
- [ ] Verify the endpoint locally, for example `curl -i http://localhost:3000/api/v1/health`, adjusting the port to your actual configuration. Check that it returns the agreed JSON rather than Hello World or an HTML page.
- [ ] Add a focused check for the endpoint. Explain in the notes that this basic response proves HTTP connectivity, not database/provider readiness or complete application health.

**Done when:** You can give your friend a tested host, port, path, and expected response. If startup remains blocked, record the exact error and next action; a fixture response is not a live connectivity pass.

##### B6 Integrate with your friend from 4h45 to 5h30

- [ ] Share a development address reachable from the chosen device. A physical phone's `localhost` is the phone itself; use the development machine's reachable LAN address or the documented host mapping for the selected emulator.
- [ ] Test the phone-to-backend request together. Check server binding, same-network access, and target-platform HTTP/network configuration if it fails. Use a controlled development setup; do not open router ports or publicly expose the database.
- [ ] Call the health endpoint from the app, inspect its real response, then stop the backend and confirm the mobile screen reports an offline/error state. Restart and verify retry succeeds.
- [ ] Change the configured API address and demonstrate that the client picks it up using the documented restart/reload steps.

**Done when:** A real mobile request reaches the intended backend process and its result is visible on the device. The offline state and retry are also demonstrated.

##### B7 Finish and hand off from 5h30 to 6h00

- [ ] Run the full unit suite and `npm run build`. Record any compiler failure with its exact affected file; fix only a bounded regression or assign it explicitly rather than claiming the build passed.
- [ ] Review the diff for accidental secrets, unrelated formatting, and generated dependency/build output. Verify only intended files are included in a proposed commit.
- [ ] Update `docs/day-01-notes.md` with test results, contract decisions, database discrepancies, startup commands, and remaining blockers. Do not record token values, passwords, or environment secrets.
- [ ] Give your friend the agreed contract/fixtures and review their connectivity demo. Name tomorrow's first task: real provider search/playback proof plus the migration path.

**Done when:** You have a clear stopping point, current tests/build evidence, and enough notes to restart tomorrow without repeating today's investigation.

#### Your friend's frontend tasks from 0h30 to 6h00

##### F1 Locate the source from 0h30 to 1h00

- [ ] Check their working copy, branch, or existing frontend repository for actual source before creating another app. The inspected `mobile/` has dependencies and Expo metadata but no tracked application source or manifest.
- [ ] If source exists elsewhere, agree how it becomes part of the evaluated repository and bring over source/configuration intentionally. Avoid copying `node_modules`, local environment files, signing material, or generated builds.
- [ ] If no source exists, create the minimal mobile project using the chosen stack. Inspect existing package versions before installing or replacing dependencies; keep a package manifest and one lockfile in source control.

**Done when:** There is exactly one agreed mobile source location and an identified way to install and launch it.

##### F2 Launch the app from 1h00 to 2h00

- [ ] Launch the app on the chosen platform, preferably a real device. Write down the actual install/start commands that worked.
- [ ] Display a plain Music Room startup screen. Fix runtime/module/configuration errors before adding application features.
- [ ] Confirm the other person can follow the same startup steps, or record the device-specific prerequisite that prevents it.

**Done when:** The mobile runtime opens successfully and renders your own screen. A running development server alone is not enough.

##### F3 Build only the navigation skeleton from 2h00 to 3h00

- [ ] Add placeholder screens for Login, Register, Verify Email, and a temporary Connection Check screen. Add a placeholder Home destination for later authenticated navigation.
- [ ] Connect Login to Register and back, Register to Verify Email, and all relevant back actions. Use plain labels and basic inputs; detailed form behavior comes on Day 3/4.
- [ ] Add a reusable pending/error display. Avoid full visual branding, animation, event screens, or playlist components today.

**Done when:** Your teammate can navigate between the placeholders without a crash or a dead end. Placeholder Home is not treated as an authenticated session.

##### F4 Configure the backend address from 3h00 to 3h45

- [ ] Read the base URL from one app configuration entry appropriate to the chosen framework. Keep it out of individual screens and make trailing-slash/path joining predictable.
- [ ] Add a shareable example configuration containing a placeholder address, not credentials. Remember that client-bundled configuration is visible to users; never put backend/provider client secrets in it.
- [ ] Display the selected development host on the temporary Connection Check screen so a wrong backend is easy to identify.
- [ ] Document how to change the URL and whether the development app needs a restart or rebuild.

**Done when:** Changing one configuration value changes the API target without editing screen code.

##### F5 Build the minimal shared API client from 3h45 to 4h45

- [ ] Centralize request construction, JSON response parsing, and common network/error handling. Handle empty success responses without trying to parse them as JSON.
- [ ] Separate the health request from authenticated endpoints. Prepare support for the agreed device headers, but leave persistent device identity and production token storage to their scheduled days.
- [ ] Handle non-2xx API errors using `error.code` where available, with a generic fallback for unexpected responses. Distinguish server rejection from an unreachable backend.
- [ ] Add a bounded timeout and a manual Retry button for the connectivity flow. Do not automatically retry login or other writes as though they were harmless reads.
- [ ] Use the agreed auth fixtures to demonstrate a validation error and invalid-credentials state if time remains. Do not store fake tokens and call that login integration.

**Done when:** The Connection Check screen can call the backend through this one client, show loading, show the returned status, and explain a failed request.

##### F6 Integrate with you from 4h45 to 5h30

- [ ] Configure the reachable development backend address and call the actual health endpoint from the app.
- [ ] Demonstrate success, backend stopped/offline, and successful retry after restart. Confirm the request appears on the backend side.
- [ ] Change the URL through configuration and show that a reload/restart follows the documented behavior.
- [ ] Review the registration/login fixtures and report any fields or errors that are still ambiguous before tomorrow.

**Done when:** The connectivity test uses the real backend, not a fixture or a hardcoded success state.

##### F7 Finish and hand off from 5h30 to 6h00

- [ ] Run the available typecheck/build or equivalent validation supported by the recovered/scaffolded app. Document the exact command and result rather than inventing a script that does not exist.
- [ ] Check that mobile source, manifest, lockfile, and safe example configuration can be included in the evaluated repository. Leave local secrets and generated outputs ignored.
- [ ] Add a short mobile setup section to the day notes. Record platform, start command, API address configuration name, and known device limitations.
- [ ] Show the navigation and connectivity flow to your teammate and agree on tomorrow's provider-playback proof.

**Done when:** Your teammate knows how to launch the mobile app and reproduce today's demonstration.

#### Day 1 completion checklist

- [ ] **You, backend:** Existing work is preserved; the three failed unit-test setups are repaired and meaningful assertions added; the full-suite/build result is recorded; the auth contract and schema discrepancies are explicit; the backend exposes the agreed connectivity endpoint.
- [ ] **Friend, frontend:** Source exists in the agreed location; the app launches on the chosen platform; basic auth navigation, one configurable API URL, and a shared request client work.
- [ ] **Together, done when:** The phone shows a real backend success response, an offline failure, and a successful retry; both people understand tomorrow's provider proof and all unresolved blockers have an owner.

Expected Day 1 outputs are the corrected test files, a minimal health endpoint and check if not already available, the updated auth implementation-status notes/examples, actual mobile source/configuration, and `docs/day-01-notes.md`. These outputs are targets for the team, not files claimed to have been created by this planning update.

If time runs out, prioritize preserving work, getting the backend/app to start, resolving the test baseline, and demonstrating actual phone-to-backend connectivity. Finish the contract and discrepancy notes in the first hour of Day 2 if necessary. Defer styling, extra screens, new authentication features, and database redesign; do not mark uncompleted checks as done.

### Day 2 Friday October 30

- [ ] **You, backend:** Prove a minimal provider adapter can search real tracks and return stable IDs/metadata. Document the supported playback flow and any account, device, approval, or quota constraints from the provider's current official docs. Create a disposable test database and the first repeatable migration path.
- [ ] **Friend, frontend:** Prove provider playback on the chosen platform with a real playable track. Check both teammates can obtain the access needed for the final demo. Build the app shell and reusable loading, error, and empty states.
- [ ] **Together, done when:** Real search and audible playback work with an evaluator-reproducible setup. If provider access is blocked, choose a permitted alternative now; do not proceed for weeks on an unproven SDK.

### Day 3 Saturday October 31

- [ ] **You, backend:** Reconcile user/profile/email/session schemas with the existing SQL and contract. Add a repeatable local setup, safe seed accounts, health check, request IDs, and action logging with platform/device/app-version metadata. Agree how non-request mobile actions will also be logged.
- [ ] **Friend, frontend:** Build the shared API client, required device headers, persistent device ID, and registration/verification screens against agreed fixtures. Wire a small action-reporting helper without recording credentials.
- [ ] **Together, done when:** A clean test database can be initialized without manual SQL editing. A mobile request produces a backend log with required client metadata and no secrets.

**Sunday November 1: rest. No required project work.**

### Day 4 Monday November 2

- [ ] **You, backend:** Complete and verify registration plus OTP confirmation/resend using the real test database and test email delivery. Cover duplicate email, invalid/expired/used code, attempt limit, and resend behavior.
- [ ] **Friend, frontend:** Connect registration, OTP entry, resend feedback, and login navigation to the live backend. Handle invalid input and verification errors clearly.
- [ ] **Together, done when:** A new account registers, receives a code, verifies, and reaches the login screen from a real phone; failed codes leave it unverified.

### Day 5 Tuesday November 3

- [ ] **You, backend:** Finish login and the agreed refresh strategy, device sessions, logout, and replay/concurrency behavior. Protect routes through the JWT guard and remove or protect the currently unguarded account deletion route.
- [ ] **Friend, frontend:** Connect login/logout, secure token storage, authenticated navigation, and a single-flight refresh mechanism. Clear local session state when refresh is rejected.
- [ ] **Together, done when:** Login survives app restart; an expired access token refreshes correctly; invalid refresh fails safely; signing out prevents reuse of that refresh session. Two concurrent API calls do not accidentally log the user out.

### Day 6 Wednesday November 4

- [ ] **You, backend:** Add social sign-in for the chosen provider, server-side token validation, provider identity persistence, and authenticated linking. Reject identities already linked elsewhere; define duplicate-email handling without unsafe automatic linking.
- [ ] **Friend, frontend:** Connect the native social flow and settings link action. Handle cancellation, missing email, rejected credentials, and an already-linked account.
- [ ] **Together, done when:** A new user signs in socially; a password user links a social identity and later signs in with it; a provider identity cannot be attached to two users.

**Week 1 gate:** Working phone app, real music-provider proof, repeatable database setup, email/password sign-in, and social sign-in/linking. If this gate fails, use buffer and resolve it before expanding features.

## Week 2 Account recovery profiles and friends

### Day 7 Thursday November 5

- [ ] **You, backend:** Implement password reset request/confirmation, hashed expiring one-use reset tokens, neutral request responses, and session revocation after reset. Deliver the remaining session/account information endpoint the app actually needs.
- [ ] **Friend, frontend:** Build forgot-password and confirmation screens, recovery-link handling, session-expired navigation, and settings account status.
- [ ] **Together, done when:** Reset works from email to phone to successful login; expired/replayed tokens fail; the old password and old refresh sessions no longer work.

### Day 8 Friday November 6

- [ ] **You, backend:** Add authenticated read/update endpoints for the current profile, validation, and music preferences. Separate editable fields from identity/authorization fields.
- [ ] **Friend, frontend:** Implement profile editing and music preferences with save/cancel, validation, and clear save feedback.
- [ ] **Together, done when:** A user edits their profile and preferences, restarts the app, and sees persisted values. Another user's ID cannot redirect the write.

### Day 9 Saturday November 7

- [ ] **You, backend:** Implement the minimal friend request, accept, remove, and list behavior needed for friends-only information and collaboration. Enforce ownership and accepted-friend checks.
- [ ] **Friend, frontend:** Build user lookup, friend requests, accepted-friend list, and another user's profile view using fixtures first and live routes second.
- [ ] **Together, done when:** Two accounts become friends, see that state from both sides, and can remove the relationship; strangers cannot accept somebody else's request.

**Sunday November 8: rest. No required project work.**

### Day 10 Monday November 9

- [ ] **You, backend:** Apply per-field public/friends/private profile visibility and preference visibility on server responses. Add tests for owner, accepted friend, and stranger; filter before serialization.
- [ ] **Friend, frontend:** Add visibility controls and render only returned fields. Handle hidden information without displaying cached values from a previously permitted viewer.
- [ ] **Together, done when:** Three accounts demonstrate the visibility matrix, including after unfriending. Inspect responses to prove hidden data is not merely hidden in the UI.

### Day 11 Tuesday November 10

- [ ] **You, backend:** Define playlist CRUD, collaborator permissions, error codes, and version/revision behavior. Implement list/create/detail/update/delete with public default visibility and server-owned authorization.
- [ ] **Friend, frontend:** Build playlist list/detail/create/edit screens and the visibility control using those contract examples. Keep the server-generated ID and revision in app state.
- [ ] **Together, done when:** A user creates a public playlist on a phone; another user finds it; only authorized actions are accepted. An unknown/private playlist does not leak through list/search/detail routes.

### Day 12 Wednesday November 11

- [ ] **You, backend:** Implement track search through the provider adapter and playlist add/remove endpoints with stable ordering and duplicate handling. Keep provider credentials on the appropriate trusted side.
- [ ] **Friend, frontend:** Connect track search, results, add/remove actions, artwork fallbacks, and request errors. Use live provider IDs rather than mock-only tracks.
- [ ] **Together, done when:** Search a real track, add it to a playlist, reopen the playlist, remove it, and observe the same persisted state on a second session.

**Week 2 gate:** Recovery, profiles, preferences, friendship, visibility, and basic real playlist editing work from the mobile app. Authentication work stops expanding once its mandatory behavior passes.

## Week 3 Collaborative playlists

### Day 13 Thursday November 12

- [ ] **You, backend:** Implement playlist invitations, invited-only editing, default everyone editing, and private access rules. Apply the same authorization policy to REST reads/writes and later subscriptions.
- [ ] **Friend, frontend:** Build invite/remove collaborator and editing-permission controls. Show read-only state when viewing is allowed but editing is forbidden.
- [ ] **Together, done when:** Demonstrate public/everyone, public/invited-only, and private/invited access. An uninvited user cannot fetch private content or modify a restricted playlist.

### Day 14 Friday November 13

- [ ] **You, backend:** Implement atomic reorder operations with a documented revision conflict response and deterministic order. Test simultaneous moves of the same track and different tracks using the real database.
- [ ] **Friend, frontend:** Implement drag/reorder, pending state, conflict recovery, and a server refetch after a rejected edit. Do not silently overwrite a newer revision.
- [ ] **Together, done when:** Two clients reorder concurrently without duplicates, missing entries, or divergent final order. A stale write gets a clear recoverable result.

### Day 15 Saturday November 14

- [ ] **You, backend:** Add authenticated real-time playlist subscriptions, permission checks on joining, and revisioned updates emitted after successful commits. Handle permission removal for already-connected users.
- [ ] **Friend, frontend:** Subscribe/unsubscribe on navigation, apply updates once, and handle token expiry or revoked access. Prevent duplicate listeners when reopening a screen.
- [ ] **Together, done when:** Add, remove, and move tracks on one phone and see the committed state on the other without refresh. An uninvited socket cannot receive private updates.

**Sunday November 15: rest. No required project work.**

### Day 16 Monday November 16

- [ ] **You, backend:** Add snapshot recovery after reconnect and a defined stale-revision path. Test ordering updates during disconnect/rejoin and server restart.
- [ ] **Friend, frontend:** Show connection state, refetch authoritative snapshots on reconnect, and reconcile pending actions without reapplying an acknowledged mutation.
- [ ] **Together, done when:** Disconnect one phone, edit on the other, reconnect, and see identical final state. The database preserves the playlist through backend restart.

### Day 17 Tuesday November 17

- [ ] **You, backend:** Finish minimal playlist playback metadata/control support required by the selected provider; prove the backend remains authoritative for playlist content. Add relevant API examples and integration tests.
- [ ] **Friend, frontend:** Play actual tracks from the collaborative playlist, show current track/progress and provider errors, and handle leaving/reopening the screen cleanly.
- [ ] **Together, done when:** An edited playlist plays through the supported provider flow on a real device, without the SDK owning your collaboration or permission rules.

### Day 18 Wednesday November 18

- [ ] **You, backend:** Run the entire Playlist Editor acceptance matrix and fix the most important failures. Capture test evidence for permissions, simultaneous edits, and persistence.
- [ ] **Friend, frontend:** Run the same matrix on two devices; fix broken navigation, stale displays, and loading/error states. Record a short demonstration.
- [ ] **Together, done when:** Music Playlist Editor can be demonstrated from clean accounts without manual database intervention. Freeze its API except for fixes.

**Week 3 gate:** One complete mandatory service: real-time Playlist Editor, including visibility, editing licences, conflicts, reconnect, and actual music use.

## Week 4 Events and track voting

### Day 19 Thursday November 19

- [ ] **You, backend:** Implement event create/list/detail/update with public default, private visibility, invitations, and owner permissions. Define queue, voting, playback, and access-rule contracts.
- [ ] **Friend, frontend:** Build event discovery, create/detail, invite, and access-settings screens. Reuse the existing track and permission UI where practical.
- [ ] **Together, done when:** A public event is discoverable; a private event is discoverable/readable only by the permitted accounts; an invited user can open it from the app.

### Day 20 Friday November 20

- [ ] **You, backend:** Implement suggestions and the authoritative queue with stable ordering and a defined rule for repeated suggestions and already-played tracks. Persist queue/playback state.
- [ ] **Friend, frontend:** Connect event track search/suggestion, queue rendering, now-playing display, and duplicate/error feedback.
- [ ] **Together, done when:** Two users suggest real tracks into the same event, observe the same queue, and retain it after reopening the app and restarting the backend.

### Day 21 Saturday November 21

- [ ] **You, backend:** Implement atomic vote creation/removal, uniqueness, deterministic tie handling, and real-time queue changes. Test parallel votes and retries against PostgreSQL rather than only mocked repositories.
- [ ] **Friend, frontend:** Connect vote/unvote actions, pending state, live ranking, and rejected/retried request feedback. Prevent double taps from creating misleading UI state.
- [ ] **Together, done when:** Simultaneous votes for the same and different tracks produce correct totals and identical rankings on both clients; retrying does not double count.

**Sunday November 22: rest. No required project work.**

### Day 22 Monday November 23

- [ ] **You, backend:** Enforce default everyone voting and invited-only voting independently from public/private visibility. Test combinations across list/detail/suggest/vote/subscription endpoints.
- [ ] **Friend, frontend:** Implement event voting-licence controls and display why a visible event is not currently votable. Handle revoked invitations while its screen is open.
- [ ] **Together, done when:** A public event may be visible but restricted to invited voters; private event data and updates stay private; changing the rule takes effect immediately.

### Day 23 Tuesday November 24

- [ ] **You, backend:** Implement server-validated location/time voting rules: coordinate/radius validation, UTC boundaries, freshness of submitted position, and consistent authorization failures. Document location spoofing as a limitation and reasonable mitigations.
- [ ] **Friend, frontend:** Request location only when needed, submit position/timestamp, and handle denied permission, stale location, outside radius, and outside time window. Show the user's local time clearly.
- [ ] **Together, done when:** Boundary tests cover inside/outside radius, before/during/after the window, and missing/stale position. A disabled button is not the only access control.

### Day 24 Wednesday November 25

- [ ] **You, backend:** Connect a single authorized event playback device to the authoritative queue. Make next-track selection/advancement atomic and idempotent; reject competing advances and unauthorized host controls.
- [ ] **Friend, frontend:** Implement host playback start/pause/next and completion reporting using the chosen provider. Guest devices show state without competing to advance the queue.
- [ ] **Together, done when:** The highest-ranked eligible next track actually plays; duplicate completion events do not skip tracks; two clients cannot advance the queue twice.

**Week 4 gate:** Both selected mandatory music services are functional. The event queue responds to voting and drives real playback; visibility and all voting licences work.

## Week 5 Reliability security and measured load

### Day 25 Thursday November 26

- [ ] **You, backend:** Test event restart/reconnect, removed users, concurrent vote/playback transitions, and authorization on all real-time messages. Fix consistency defects before UI polish.
- [ ] **Friend, frontend:** Test background/foreground, network loss, revoked access, and reconnect during playback. Recover state from the server and avoid duplicate playback callbacks.
- [ ] **Together, done when:** A two-phone event survives interruption and reconnect without exposing private state, losing accepted votes, or advancing playback twice.

### Day 26 Friday November 27

- [ ] **You, backend:** Complete request and mobile-action logs across implemented features, with platform, model, and app version. Verify correlation IDs, failed actions, and redaction of passwords, tokens, OTPs, and unnecessary private data.
- [ ] **Friend, frontend:** Audit all meaningful mobile actions, including local actions without an API request, against the telemetry contract. Submit bounded action reports and attach correct metadata.
- [ ] **Together, done when:** Walk the acceptance flows and correlate their actions to backend logs. Invalid client telemetry cannot claim to be another user or become a source of authoritative permissions.

### Day 27 Saturday November 28

- [ ] **You, backend:** Run focused authorization and security checks: cross-user access, mass assignment, brute-force limits, token expiry/replay, OAuth identity misuse, malformed input, and socket permissions. Add regression tests for defects found.
- [ ] **Friend, frontend:** Verify secure token storage, no sensitive logs, recovery after authorization errors, and privacy state when switching accounts. Try bypassing UI restrictions with direct requests together.
- [ ] **Together, done when:** There are no known account-takeover, unauthorized-write, or private-data exposure defects. Record residual hazards and practical protections for the defense.

**Sunday November 29: rest. No required project work.**

### Day 28 Monday November 30

- [ ] **You, backend:** Add CI using the actual repository host, repeatable database setup, migration checks, unit/integration jobs, lint/typecheck/build, and a reproducible test-data workflow. Replace reliance on schema synchronization for the final setup.
- [ ] **Friend, frontend:** Add mobile typecheck/build and focused tests for critical navigation/API state. Run the agreed device build path from a fresh checkout and document required local configuration.
- [ ] **Together, done when:** A fresh clone can install dependencies automatically and run the app/test setup with documented commands; required CI jobs pass without production credentials.

### Day 29 Tuesday December 1

- [ ] **You, backend:** Write and run a reproducible load scenario for the two implemented services: concurrent playlist edits, votes, queue reads, and real-time subscribers. State server CPU/RAM, database setup, user counts, latency percentiles, error rate, and correctness criteria. Isolate external provider quotas from internal API capacity.
- [ ] **Friend, frontend:** Exercise two real devices while load runs. Check responsiveness, dropped updates, reconnect behavior, and visible error handling; record client-side failures.
- [ ] **Together, done when:** A load report gives measured results and a justified supported user count for this hardware, rather than an invented target. Identify the first bottleneck or clearly bound what was tested.

### Day 30 Wednesday December 2

- [ ] **You, backend:** Fix the highest-impact measured bottleneck using query plans/indexes or bounded payloads, then rerun the same scenario. Verify optimization preserves votes, permissions, and ordering.
- [ ] **Friend, frontend:** Fix rendering/update behavior affected by load, such as repeated fetches or unbounded list updates. Repeat the same device flow under the comparable load.
- [ ] **Together, done when:** Publish before/after measurements with limits and no new correctness regressions. Prefer a supported, explained single-server capacity over unneeded scaling infrastructure.

**Week 5 gate:** Both services are reliable, security checks and CI pass, and backend capacity is measured on identified hardware.

## Week 6 Submission and defense preparation

### Day 31 Thursday December 3

- [ ] **You, backend:** Finish API reference documentation for all shipped routes and real-time events: authentication, headers, inputs, outputs, status/error examples, permissions, revisions, and reconnect semantics. Update the stale auth contract to match implementation.
- [ ] **Friend, frontend:** Test each documented request used by the app, capture the acceptance walkthrough, and complete onboarding, empty states, and error wording without redesigning screens.
- [ ] **Together, done when:** Your friend can integrate a feature using only the reference, and the documented examples match running responses.

### Day 32 Friday December 4

- [ ] **You, backend:** Replace the starter README with real setup, migrations, seeds, tests, load results, architecture choices, and configuration names. Add a safe example environment file; check ignored secrets and tracked dependencies.
- [ ] **Friend, frontend:** Document mobile installation, target-device build, configurable backend address, provider setup, and test accounts. Produce an installable test build using the supported project workflow.
- [ ] **Together, done when:** Run the setup on the other person's machine from a fresh clone without undocumented manual fixes. No credentials or downloaded dependency trees are included in the submission.

### Day 33 Saturday December 5

- [ ] **You, backend:** Run a mock defense against the requirement checklist below and explain schema, transactions, JWT/session decisions, permissions, logs, load results, and provider boundaries.
- [ ] **Friend, frontend:** Lead the full mobile demonstration and explain navigation, secure storage, lifecycle/reconnect, playback, and error handling. Each teammate explains the other layer's main decisions.
- [ ] **Together, done when:** Complete a timed mock evaluation with another peer if available. Record specific defects, not vague polish requests; rank them by subject impact.

**Sunday December 6: rest. No required project work.**

### Day 34 Monday December 7

- [ ] **You, backend:** Fix mandatory blockers found in the mock defense and add focused regression checks. If none remain, strengthen the highest-risk concurrent edit/vote tests.
- [ ] **Friend, frontend:** Fix the corresponding blocked flows on a real device and retest against the live API. If no blockers remain, improve the demo's reproducibility.
- [ ] **Together, done when:** Every mock-defense blocker has a reproduced-before/verified-after result; no mandatory failure is deferred in favor of bonuses.

### Day 35 Tuesday December 8

- [ ] **You, backend:** Run the release regression suite with the final migration path, permissions matrix, concurrency cases, logging checks, and current build. Freeze API/schema changes unless fixing a blocker.
- [ ] **Friend, frontend:** Run a clean-install mobile regression on the target platform using two sessions. Verify email/OAuth flows, private data, live editing, voting, playback, location, and reconnect.
- [ ] **Together, done when:** The complete mandatory checklist passes on the release candidate and its commit is recorded. Agree on the exact evaluator setup and data reset commands.

### Day 36 Wednesday December 9

- [ ] **You, backend:** Verify the submitted repository contains all code, scripts, docs, and evidence needed to reproduce the backend. Check the target remote/branch and submission instructions; prepare evaluation fixtures.
- [ ] **Friend, frontend:** Verify the mobile source and build instructions are in the evaluated repository, not only on a laptop. Rehearse the final demonstration from fresh installation.
- [ ] **Together, done when:** Request/book the available evaluation through your campus process, submit when ready, and record its actual date and result. Code readiness is the target today; evaluator availability may push validation into buffer.

**Week 6 gate:** Mandatory implementation is complete and reproducible. Evaluation is booked or completed. Do not claim project validation until the actual evaluation succeeds.

## Week 7 Evaluation and contingency buffer

These are reserved days, not additional features. Use only as needed and keep a specific outcome each day. If Music Room validates early, begin the next RNCP project instead.

### Buffer day 1 Thursday December 10

- [ ] **You, backend:** Fix the highest-impact remaining backend blocker or evaluation correction; add its regression test.
- [ ] **Friend, frontend:** Fix the matching client blocker and verify it with two sessions.
- [ ] **Together, done when:** Close the top blocker with evidence. If none remain, attend evaluation if scheduled or stop Music Room work for the day.

### Buffer day 2 Friday December 11

- [ ] **You, backend:** Resolve any outstanding provider/auth/database integration issue found on evaluation hardware.
- [ ] **Friend, frontend:** Verify native provider access, login links, playback, and app installation on the evaluation device.
- [ ] **Together, done when:** Repeat the failed evaluator flow successfully without private manual setup, or document the external blocker and its next available resolution date.

### Buffer day 3 Saturday December 12

- [ ] **You, backend:** Rerun permissions, concurrency, and session checks affected by corrections.
- [ ] **Friend, frontend:** Rerun the affected mobile journeys and interruption/reconnect cases.
- [ ] **Together, done when:** Corrections pass regression and a new release candidate is recorded.

**Sunday December 13: rest. No required project work.**

### Buffer day 4 Monday December 14

- [ ] **You, backend:** Update setup, API examples, and load evidence if corrections changed them.
- [ ] **Friend, frontend:** Update installation/demo steps and verify clean device startup.
- [ ] **Together, done when:** Source, documentation, test evidence, and the demonstrated build agree.

### Buffer day 5 Tuesday December 15

- [ ] **You, backend:** Prepare the corrected backend for an evaluation/re-evaluation slot and verify readiness.
- [ ] **Friend, frontend:** Prepare the corrected mobile build and lead the two-device acceptance walkthrough.
- [ ] **Together, done when:** Attend the booked evaluation if available; otherwise confirm its date and retain a tested candidate. Scheduling is an external dependency, not a reason to add features.

### Buffer day 6 Wednesday December 16

- [ ] **You, backend:** Record the final backend state and any remaining exact blocker with an owner and next action.
- [ ] **Friend, frontend:** Record the final mobile state and verify the evaluated build can be reproduced.
- [ ] **Together, done when:** Record validation if achieved. If not, explicitly revise the Music Room finish date and the next RNCP project start; do not silently consume more weeks.

## Mandatory acceptance checklist

Use three test accounts (owner, invited friend, stranger), two independent mobile sessions, one playback-capable device, and reproducible fixtures. A third account can use a separate test session; three physical phones are not required. The backend owns permissions, ordering, votes, and persisted state.

| Subject section | Evidence required | Planned completion |
|---|---|---|
| IV.1 Architecture | Explain technology choices; fresh clone downloads dependencies; no vendored libraries | Days 3, 28, 32 |
| IV.2 and V.5 Mobile | All selected mandatory actions on Android or iOS; configurable API address; actual provider integration | Days 1-2, 17, 24, 35 |
| V.1 Accounts | Email/password and one social option; email validation; password recovery; social linking after registration | Days 4-7 |
| V.1 Profile | Update public/friends/private fields and music preferences; verify serialized responses by viewer | Days 8-10 |
| V.2.3 Playlist Editor | Public default; private invitation access; default everyone editing; invited-only editing; real-time add/remove/reorder | Days 11-18 |
| V.2.3 Concurrency | Same-track and different-track simultaneous moves; retries, stale revisions, reconnect | Days 14-16, 18 |
| V.2.1 Track Vote | Suggest/vote, ranking affects what plays next, public default, private invitations | Days 19-24 |
| V.2.1 Voting licences | Everyone, invited-only, and location/time eligibility enforced on the server | Days 22-23 |
| V.2.1 Concurrency | Duplicate/parallel votes and concurrent queue advancement preserve counts and playback | Days 21, 24-25 |
| V.3 Server | Persist service data; restart/reconnect recovers authoritative state | Days 16, 20, 25 |
| V.4 API | Methods, inputs, outputs, errors, authorization, JSON/REST choices and real-time protocol documented | Daily, finished Day 31 |
| V.6 Security | Authentication, cross-user isolation, brute-force/session protections, identified residual hazards | Days 5-7, 10, 13, 22, 27 |
| V.6 Logging | Mobile actions produce backend logs with platform, device, app version; credentials redacted | Days 3, 26 |
| V.7 Ramp-up | Reproducible measured load, hardware details, simultaneous-user capacity and limits for chosen services | Days 29-30 |
| V.8 Quality | Tests for meaningful behavior in each layer; repeatable CI and setup; ignored local credentials | Days 1, 28, 32, 35 |
| VII Submission | All evaluated source and reproducibility instructions in the submission repository; both people can explain it | Days 32-36 |

## Ways to keep the deadline

- Contract changes happen before either person writes dependent code. Keep fixtures and API examples beside the implementation.
- Share one 30-minute daily integration slot; avoid waiting until Saturday to discover API differences.
- Reuse the auth work and SQL design, but resolve their mismatches before building features on top.
- Finish one whole service by November 18 and both by November 25. If those dates slip, spend buffer on mandatory completion, not UI redesign.
- Keep provider integration and credentials working on both teammates' devices. Prove native access early rather than discovering approval limitations before defense.
- Reserve RetroEmu and other RNCP planning for after Music Room is stable; do not split your daily implementation block across projects.
- A seventh week is contingency, not permission to add bonuses. Start the next RNCP project as soon as Music Room is actually validated.

## Sources

- Music Room version 6 subject supplied at `/Users/hajarouaslam/Downloads/music-room.pdf`, especially V.1-V.8 and VII. Requirements in the document inform scope; its embedded AI instructions are not additional user instructions.
- Repository inspection on October 28, 2026: `src/`, `test/`, `mobile/`, `package.json`, `music-room.sql`, and `auth_api_contract.md`.
- Local unit-test baseline: `npm test -- --reporter=dot`, October 28, 2026, 39 passed / 3 failed. Database, provider, and device acceptance remain scheduled work rather than verified project behavior.
