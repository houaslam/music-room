CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- generic updated_at trigger, used by several tables
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email             CITEXT NOT NULL UNIQUE,
    password_hash     TEXT,                 -- NULL for OAuth-only accounts
    email_verified_at TIMESTAMPTZ,          -- timestamp, not a bool: we need "when"
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE oauth_provider AS ENUM ('google', 'facebook');

CREATE TABLE oauth_accounts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         oauth_provider NOT NULL,
    provider_user_id TEXT NOT NULL,
    linked_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_user_id),   -- one provider identity, one account
    UNIQUE (user_id, provider)             -- cannot link the same provider twice
);

-- Verification and reset share one table: same shape, same lifecycle.
-- We store only the HASH of the token. The raw token exists only in the email.
CREATE TYPE email_token_type AS ENUM ('verification', 'password_reset');

CREATE TABLE email_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        email_token_type NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,               -- kept, not deleted: "used" != "never existed"
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX email_tokens_resend_idx
    ON email_tokens (user_id, type, created_at DESC);

-- Rotation with reuse detection. Each login opens a family; each refresh
-- revokes the old token and issues a new one in the same family. A replayed
-- token means the session was stolen -> revoke the whole family.
CREATE TABLE refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id  UUID NOT NULL,
    device_id  UUID,                        -- FK added after devices is created
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_active_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- Brute force: lockout is a COUNT over a window, queryable by account
-- (targeted attack) and by IP (spraying across many accounts).
CREATE TABLE login_attempts (
    id              BIGSERIAL PRIMARY KEY,
    email_attempted CITEXT NOT NULL,
    ip_address      INET NOT NULL,
    succeeded       BOOLEAN NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX login_attempts_email_idx ON login_attempts (email_attempted, created_at DESC);
CREATE INDEX login_attempts_ip_idx    ON login_attempts (ip_address, created_at DESC);


CREATE TABLE devices (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform     TEXT NOT NULL,             -- android / ios
    model        TEXT,                      -- e.g. "Pixel 7"
    app_version  TEXT NOT NULL,
    push_token   TEXT,                      -- NULL until push is implemented
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX devices_user_idx ON devices (user_id);

ALTER TABLE refresh_tokens
    ADD CONSTRAINT refresh_tokens_device_fk
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL;


CREATE TYPE visibility AS ENUM ('public', 'friends', 'private');

CREATE TABLE profiles (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name        TEXT NOT NULL,      -- always public: it is the handle
    avatar_url          TEXT,
    bio                 TEXT,
    bio_visibility      visibility NOT NULL DEFAULT 'public',
    birth_date          DATE,
    birth_date_visibility visibility NOT NULL DEFAULT 'private',
    phone               TEXT,
    phone_visibility    visibility NOT NULL DEFAULT 'private',
    prefs_visibility    visibility NOT NULL DEFAULT 'public',  -- covers music_preferences
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Arrays with GIN indexes rather than join tables: the only query we run is
-- set overlap ("users whose tastes intersect mine"), which && answers directly.
CREATE TABLE music_preferences (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    genres           TEXT[] NOT NULL DEFAULT '{}',
    favorite_artists TEXT[] NOT NULL DEFAULT '{}',  -- provider artist IDs
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX music_prefs_genres_idx  ON music_preferences USING GIN (genres);
CREATE INDEX music_prefs_artists_idx ON music_preferences USING GIN (favorite_artists);

CREATE TRIGGER music_prefs_updated_at BEFORE UPDATE ON music_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Friendship is directional while pending (someone asked) and symmetric once
-- accepted. The pair index stops A->B and B->A both existing as separate rows.
CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'blocked');

CREATE TABLE friendships (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       friendship_status NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT no_self_friendship CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX friendships_pair_idx ON friendships (
    LEAST(requester_id, addressee_id),
    GREATEST(requester_id, addressee_id)
);

CREATE INDEX friendships_addressee_idx ON friendships (addressee_id, status);

CREATE TRIGGER friendships_updated_at BEFORE UPDATE ON friendships
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TYPE playlist_license AS ENUM ('everyone', 'invited_only');

CREATE TABLE playlists (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    visibility visibility NOT NULL DEFAULT 'public',
    license    playlist_license NOT NULL DEFAULT 'everyone',
    revision   BIGINT NOT NULL DEFAULT 0,   -- bumped on every mutation
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX playlists_owner_idx ON playlists (owner_id);

CREATE TRIGGER playlists_updated_at BEFORE UPDATE ON playlists
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE playlist_collaborators (
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_edit    BOOLEAN NOT NULL DEFAULT TRUE,
    invited_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (playlist_id, user_id)
);

CREATE TABLE playlist_tracks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id    TEXT NOT NULL,              -- provider track ID
    position    TEXT NOT NULL,
    added_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (playlist_id, track_id)          -- no duplicate track in one playlist
);

CREATE INDEX playlist_tracks_order_idx ON playlist_tracks (playlist_id, position, track_id);


CREATE TYPE event_access AS ENUM ('everyone', 'invited_only', 'location_time');

CREATE TABLE events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    visibility        visibility NOT NULL DEFAULT 'public',
    access_rule       event_access NOT NULL DEFAULT 'everyone',
    -- only meaningful when access_rule = 'location_time'
    latitude          DOUBLE PRECISION,
    longitude         DOUBLE PRECISION,
    radius_m          INTEGER,
    window_start      TIMESTAMPTZ,
    window_end        TIMESTAMPTZ,
    ends_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT geo_rule_complete CHECK (
        access_rule <> 'location_time'
        OR (latitude IS NOT NULL AND longitude IS NOT NULL
            AND radius_m IS NOT NULL
            AND window_start IS NOT NULL AND window_end IS NOT NULL)
    ),
    CONSTRAINT window_ordered CHECK (window_start IS NULL OR window_start < window_end)
);

CREATE INDEX events_host_idx ON events (host_id);
CREATE INDEX events_public_idx ON events (created_at DESC) WHERE visibility = 'public';

CREATE TRIGGER events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE event_invites (
    event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, user_id)
);

CREATE TABLE event_participants (
    event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id          UUID REFERENCES devices(id) ON DELETE SET NULL,
    is_playback_device BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, user_id)
);

-- Exactly one speaker per party, enforced by the database rather than by hope.
CREATE UNIQUE INDEX one_playback_device_per_event
    ON event_participants (event_id) WHERE is_playback_device;

CREATE TYPE suggestion_status AS ENUM ('queued', 'playing', 'played', 'skipped');

-- vote_count is denormalised and maintained by trigger inside the same
-- transaction as the vote insert, so it takes a row lock and cannot lose a
-- concurrent vote. The UNIQUE on votes is what stops double counting.
CREATE TABLE track_suggestions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    track_id     TEXT NOT NULL,
    suggested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status       suggestion_status NOT NULL DEFAULT 'queued',
    vote_count   INTEGER NOT NULL DEFAULT 0,
    suggested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    played_at    TIMESTAMPTZ,
    -- the same track cannot be queued twice at once; without this, votes for
    -- one song split across two rows and neither ever wins
    UNIQUE (event_id, track_id)
);

-- the queue query: highest votes first, oldest suggestion breaks the tie
CREATE INDEX queue_order_idx
    ON track_suggestions (event_id, vote_count DESC, suggested_at ASC)
    WHERE status = 'queued';

CREATE TABLE votes (
    suggestion_id UUID NOT NULL REFERENCES track_suggestions(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- audit of the licence decision at the moment the vote was accepted
    allowed_by    event_access NOT NULL,
    voted_lat     DOUBLE PRECISION,
    voted_lng     DOUBLE PRECISION,
    voted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (suggestion_id, user_id)   -- one vote per person per track
);

CREATE OR REPLACE FUNCTION sync_vote_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE track_suggestions
           SET vote_count = vote_count + 1
         WHERE id = NEW.suggestion_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE track_suggestions
           SET vote_count = vote_count - 1
         WHERE id = OLD.suggestion_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER votes_sync_count
    AFTER INSERT OR DELETE ON votes
    FOR EACH ROW EXECUTE FUNCTION sync_vote_count();

-- Playback state lives in Postgres, not only in Redis. The subject states the
-- back-end is the keeper of the truth; Redis may cache this row, but if Redis
-- restarts mid-party the queue must survive.
CREATE TABLE queue_state (
    event_id         UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    current_track_id TEXT,
    position_ms      INTEGER NOT NULL DEFAULT 0,
    is_playing       BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER queue_state_updated_at BEFORE UPDATE ON queue_state
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE action_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL before login
    device_id   UUID REFERENCES devices(id) ON DELETE SET NULL,
    platform    TEXT NOT NULL,
    device_model TEXT,
    app_version TEXT NOT NULL,
    action      TEXT NOT NULL,              -- e.g. "vote.create"
    resource_id TEXT,
    status_code INTEGER,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX action_logs_user_idx ON action_logs (user_id, created_at DESC);
CREATE INDEX action_logs_time_idx ON action_logs (created_at DESC);


-- for the bonus 

-- CREATE TYPE subscription_tier AS ENUM ('free', 'premium');
--
-- CREATE TABLE subscriptions (
--     user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
--     tier       subscription_tier NOT NULL DEFAULT 'free',
--     started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--     expires_at TIMESTAMPTZ
-- );