-- Apply after the friendships table exists (schema sync or music-room.sql).
-- Duplicate unordered pairs must be resolved before this migration can succeed.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx ON friendships (
    LEAST(requester_id, addressee_id),
    GREATEST(requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id, status);
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'friendships'::regclass AND conname = 'no_self_friendship'
    ) THEN
        ALTER TABLE friendships ADD CONSTRAINT no_self_friendship
            CHECK (requester_id <> addressee_id);
    END IF;
END;
$$;
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS friendships_updated_at ON friendships;
CREATE TRIGGER friendships_updated_at BEFORE UPDATE ON friendships
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMIT;
