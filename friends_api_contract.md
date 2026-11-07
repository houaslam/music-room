# API Contracts - Friends Service

## General

- base path: `/api/v1`
- all routes are protected: `Authorization: Bearer <access_token>`
- routes are implemented and covered by automated tests; live mobile verification is pending
- required client headers:
    - `X-Platform` (android / ios / web)
    - `X-Device-Model`
    - `X-App-Version`
    - `X-Device-Id` (uuid)
- the current user comes from the access token, never from the request body
- error format:
    ```json
    { "error": { "code": "USER_NOT_FOUND", "message": "..." } }
    ```
    app checks `code`, not `message`
- common errors on all routes:
    - 400: VALIDATION_ERROR -- invalid UUID, body, query or unknown fields
    - 400: MISSING_CLIENT_HEADERS -- required client headers missing or invalid
    - 401: INVALID_CREDENTIALS -- missing, invalid or expired token, or deleted account
    - 429: RATE_LIMITED -- include `Retry-After` in seconds
    - 500: INTERNAL_ERROR -- unexpected failure
- user summary: `user_id` (uuid), `display_name` (string), `avatar_url` (string or null)
- friendship object: `id`, `requester_id`, `addressee_id` (uuids), `status` (pending / accepted), `created_at`, `updated_at` (ISO timestamps)
- relationship_status is computed relative to the caller: `none`, `outgoing_pending`, `incoming_pending`, `accepted`
- lists return only safe user summaries; read other allowed fields through the profile API
- use SQL column names for stored fields: id, requester_id, addressee_id, status, created_at and updated_at
- id always means friendships.id in friendship responses and request paths; user summaries use profiles.user_id
- relationship_status and direction are API-only values; status keeps its SQL meaning (pending / accepted)
- items and user are response containers, not SQL columns
- IDs identify users; display names are not unique

## Lists

- list response: `{ "items": [] }`
- return all matching results; no pagination in this version
- empty lists return 200 with an empty items array

---

## Protected

- friends/users
    - Method: GET
    - Request Body: none
    - Query Parameters:
        - display_name (required string, trimmed and Unicode NFC normalized, 2–50 Unicode characters)
    - Response Body:
        - items (array of user summaries, each with relationship_status and id)
    - Status Codes:
        - 200: OK
    - Notes:
        - search display names by case-insensitive literal substring; no email or phone search
        - treat `%` and `_` as literal characters; use parameterized queries
        - exclude the caller, unavailable accounts/profiles and blocked pairs
        - include existing friends and pending requests so the app can show their state
        - id is null when relationship_status is none
        - order by lowercase display_name ascending, then user_id ascending

- friends
    - Method: GET
    - Request Body: none
    - Query Parameters: none
    - Response Body:
        - items (array):
            - id (uuid)
            - user (the other person's user summary)
            - updated_at (ISO timestamp)
    - Status Codes:
        - 200: OK
    - Notes:
        - returns only the caller's accepted friends, in either request direction
        - updated_at is set when the friendship is accepted
        - order by updated_at descending, then id descending

- friends/requests
    - Method: GET
    - Request Body: none
    - Query Parameters:
        - direction (optional: incoming / outgoing; default incoming)
    - Response Body:
        - items (array of friendship objects, each with user: the other person's user summary)
    - Status Codes:
        - 200: OK
    - Notes:
        - returns only the caller's pending requests in the selected direction
        - order by created_at descending, then id descending

- friends/requests
    - Method: POST
    - Request Body:
        - addressee_id (uuid of the person receiving the request; only accepted field)
    - Response Body:
        - friendship object
    - Status Codes:
        - 201: request created
        - 200: same outgoing request already exists; return it unchanged
        - 400: SELF_FRIENDSHIP -- cannot send a request to yourself
        - 404: USER_NOT_FOUND -- target account/profile unavailable or pair blocked
        - 409: INCOMING_REQUEST_EXISTS -- this person already sent you a request
        - 409: ALREADY_FRIENDS
    - Notes:
        - server sets requester_id from the access token, plus status and timestamps
        - a reverse request does not automatically accept; use the accept route
        - find the incoming request ID through relationship lookup or the incoming list

- friends/requests/:id/accept
    - Method: PATCH
    - Request Body: none
    - Response Body:
        - accepted friendship object
    - Status Codes:
        - 200: accepted, or already accepted by this addressee
        - 403: FRIEND_REQUEST_FORBIDDEN -- requester cannot accept their own request
        - 404: FRIEND_REQUEST_NOT_FOUND -- missing, deleted, blocked or unrelated request
    - Notes:
        - id identifies a friendship row, not a user
        - only the original addressee can accept
        - change pending to accepted; preserve the ID, direction and created_at
        - update updated_at on first acceptance; retries leave timestamps unchanged
        - accepted friends can immediately read each other's friends-visible profile fields

- friends/requests/:id
    - Method: DELETE
    - Request Body: none
    - Response Body: (empty)
    - Status Codes:
        - 204: request cancelled, declined or already unavailable
        - 409: FRIEND_REQUEST_NOT_PENDING -- caller's relationship is already accepted
    - Notes:
        - requester cancels; addressee declines; both actions delete the pending row
        - missing, blocked or unrelated rows return 204 without changes
        - deleted request IDs cannot be accepted; a later request gets a new ID
        - use DELETE friends/:user_id to remove an accepted friendship

- friends/relationships/:user_id
    - Method: GET
    - Request Body: none
    - Response Body:
        - user_id (uuid)
        - relationship_status (none / outgoing_pending / incoming_pending / accepted)
        - id (uuid or null)
    - Status Codes:
        - 200: OK -- no relationship returns none and a null id
        - 400: SELF_FRIENDSHIP -- target is the caller
        - 404: USER_NOT_FOUND -- target account/profile unavailable or pair blocked
    - Notes:
        - returns only the caller's relationship with the target

- friends/:user_id
    - Method: DELETE
    - Request Body: none
    - Response Body: (empty)
    - Status Codes:
        - 204: friendship removed, or no accepted friendship exists
        - 400: SELF_FRIENDSHIP -- target is the caller
    - Notes:
        - either participant can remove an accepted friendship
        - missing targets and repeat calls return 204
        - pending requests and blocked rows remain unchanged
        - both users immediately lose access to each other's friends-visible profile fields
        - accounts and profiles are not deleted

---

## Rules

- only one friendship row per unordered user pair; A → B and B → A cannot both exist
- enforce no self-friendship in the database too
- pending requests do not grant friends-only profile access; private fields stay owner-only
- checks and writes must be atomic; concurrent operations must behave as if run one at a time
- concurrent same-direction requests return the same row: 201 for creation, 200 for the repeat
- concurrent opposite-direction requests create one row; the other caller gets 409 INCOMING_REQUEST_EXISTS
- handle unique-pair conflicts by reading the existing relationship after rollback, never leaking a database error
- accept versus cancel: deletion first means accept returns 404; acceptance first means request deletion returns 409
- unfriend before acceptance leaves a pending request unchanged; unfriend after acceptance deletes it
- stale friendship IDs never operate on a newer request between the same users
- no-op retries preserve timestamps; failed writes roll back the whole change
- blocked is reserved: hide blocked pairs, and never change or delete them through these routes
- omit unavailable accounts/profiles from lists; deleting an account cascades to its friendships
- register the entity and keep migrations aligned with the SQL indexes and constraints
- profile checks must recognize accepted friendships in either direction
- friendship does not grant playlist editing, invitation or voting permissions
- app refreshes affected lists and relationship state after actions; after unfriending, discard cached friends-only fields
- notifications and realtime updates are outside this contract

## Rate limits

Limits apply per IP, separately for each route. Exceeding a limit returns
429 RATE_LIMITED with Retry-After in seconds.

| Method | Route | Limit |
| --- | --- | --- |
| GET | friends | 60 / minute |
| GET | friends/users | 30 / minute |
| GET | friends/requests | 60 / minute |
| POST | friends/requests | 20 / minute |
| PATCH | friends/requests/:id/accept | 30 / minute |
| DELETE | friends/requests/:id | 30 / minute |
| GET | friends/relationships/:user_id | 60 / minute |
| DELETE | friends/:user_id | 30 / minute |

Rate counters currently use in-memory storage and reset on restart. Multiple
application instances need a shared throttler store to enforce a combined limit.

## Database setup and verification

- Apply migrations/20261104_friendships.sql after creating the friendships table.
  SQL files in migrations are not applied automatically by the app.
- The migration creates the unordered-pair unique index, self-friendship check,
  addressee/status index and updated_at trigger. Existing duplicate pairs must
  be resolved before the unique index can be created.
- requester_id and addressee_id are UUID fields in the entity; requester and
  addressee are the optional loaded user relations.
- Automated HTTP tests cover routing, validation, status codes and all rate limits.
- Run the real PostgreSQL checks against a test server with
  FRIENDS_TEST_DB_HOST set, using npm run test:friends-db. The test creates and
  deletes its own disposable database; it does not use the application database.
