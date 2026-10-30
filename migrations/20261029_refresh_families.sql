-- Run before starting the updated app against an existing database.
-- Legacy refresh JWT IDs cannot be recovered from token hashes: revoke those
-- sessions while retaining their rows. Existing users must log in again.
BEGIN;

CREATE TABLE IF NOT EXISTS refresh_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL,
    revoked_at TIMESTAMPTZ
);

ALTER TABLE refresh_tokens
    DROP CONSTRAINT IF EXISTS "UQ_refresh_tokens_user_id";
ALTER TABLE refresh_tokens
    ADD COLUMN IF NOT EXISTS family_id UUID,
    ADD COLUMN IF NOT EXISTS device_id UUID,
    ADD COLUMN IF NOT EXISTS jti UUID,
    ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

UPDATE refresh_tokens
SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
    family_id = COALESCE(family_id, gen_random_uuid()),
    device_id = COALESCE(device_id, gen_random_uuid()),
    jti = COALESCE(jti, gen_random_uuid())
WHERE family_id IS NULL OR device_id IS NULL OR jti IS NULL;

INSERT INTO refresh_families (id, user_id, device_id, revoked_at)
SELECT DISTINCT ON (family_id) family_id, user_id, device_id, revoked_at
FROM refresh_tokens
ON CONFLICT (id) DO NOTHING;

ALTER TABLE refresh_tokens
    ALTER COLUMN family_id SET NOT NULL,
    ALTER COLUMN device_id SET NOT NULL,
    ALTER COLUMN jti SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_jti_unique ON refresh_tokens(jti);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS refresh_families_user_idx ON refresh_families(user_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'refresh_tokens'::regclass AND contype = 'f'
          AND confrelid = 'refresh_families'::regclass
    ) THEN
        ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_family_fk
            FOREIGN KEY (family_id) REFERENCES refresh_families(id) ON DELETE CASCADE;
    END IF;
END $$;

COMMIT;
