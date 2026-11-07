# API Contract - Profile Service

- Base path: `/api/v1`.
- All endpoints require `Authorization: Bearer <access_token>`.
- `/me` uses the authenticated user ID. Identity fields such as `user_id`, email and password cannot be updated here.
- Visibility values: `public`, `friends`, `private`.

## GET /profile/me

- Request body: none.
- Response body:
  - `user_id`: uuid
  - `display_name`: string
  - `avatar_url`: string or null
  - `bio`: string or null
  - `birth_date`: string (`YYYY-MM-DD`) or null
  - `phone`: string or null
  - `bio_visibility`: visibility
  - `birth_date_visibility`: visibility
  - `phone_visibility`: visibility
  - `prefs_visibility`: visibility
  - `music_preferences`: object

```json
{
  "genres": ["jazz", "rock"],
  "favorite_artists": ["spotify-artist-id"]
}
```

- The owner receives all their fields regardless of visibility.
- Status codes: `200 OK`, `401 INVALID_CREDENTIALS`, `404 PROFILE_NOT_FOUND`.

## PATCH /profile/me

- Request body: any editable fields listed above; `user_id` is not editable.
- All fields are optional. Omitted fields remain unchanged.
- `display_name`: non-empty string, maximum 50 characters.
- `avatar_url`: valid URL; `birth_date`: valid `YYYY-MM-DD` date.
- `null` clears avatar, bio, birth date or phone. Display name and visibility settings cannot be null.
- `music_preferences` uses the same object shape as GET, with string arrays. Supplied arrays replace saved arrays; `[]` clears them. Omitted arrays remain unchanged.
- Reject unknown or non-editable fields. Apply profile and preference updates atomically.
- Response body: empty.
- Status codes: `204 No Content`, `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `404 PROFILE_NOT_FOUND`.

## GET /profile/:user_id

- Request body: none. `user_id` must be a UUID.
- Always return `user_id`, `display_name` and `avatar_url`.
- Filter bio, birth date, phone and music preferences using their visibility settings:
  - `public`: visible to any authenticated user.
  - `friends`: visible to the owner and accepted friends.
  - `private`: visible only to the owner.
- Omit hidden fields. Return visibility settings only to the owner.
- Status codes: `200 OK`, `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `404 PROFILE_NOT_FOUND`.
