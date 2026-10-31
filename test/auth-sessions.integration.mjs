// Runs against a newly created disposable database, never the application DB.
// Build first, then provide AUTH_TEST_DB_HOST and optional PORT/USER/PASSWORD.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { DataSource, IsNull } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../dist/auth/auth.service.js';
import { RefreshTokenService } from '../dist/auth/refresh-tokens.service.js';
import { Users } from '../dist/user/entities/user.entity.js';
import { RefreshTokens } from '../dist/auth/entities/refresh-tokens.entity.js';
import { RefreshFamilies } from '../dist/auth/entities/refresh-families.entity.js';

if (!process.env.AUTH_TEST_DB_HOST) {
  throw new Error('Set AUTH_TEST_DB_HOST to a disposable PostgreSQL server.');
}
const connection = {
  host: process.env.AUTH_TEST_DB_HOST,
  port: Number(process.env.AUTH_TEST_DB_PORT ?? 5432),
  user: process.env.AUTH_TEST_DB_USER ?? 'postgres',
  password: process.env.AUTH_TEST_DB_PASSWORD,
};
const database = `music_room_auth_test_${randomUUID().replaceAll('-', '')}`;
const admin = new Client({ ...connection, database: 'postgres' });
const jwt = new JwtService({
  secret: 'db-test-access',
  signOptions: { expiresIn: '1h' },
});
const config = { secret: 'db-test-refresh', expiresIn: '7d' };
// Hashing is covered separately; this suite verifies actual PostgreSQL transactions.
const hasher = {
  hash: async (raw) => `hash:${raw}`,
  verify: async (raw, hash) => hash === `hash:${raw}`,
};
const device = {
  platform: 'ios',
  deviceModel: 'test',
  appVersion: '1.0.0',
  deviceId: randomUUID(),
};
let source;
let created = false;
let passed = 0;
await admin.connect();
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  source = new DataSource({
    type: 'postgres',
    host: connection.host,
    port: connection.port,
    username: connection.user,
    password: connection.password,
    database,
    entities: [Users, RefreshTokens, RefreshFamilies],
    synchronize: false,
  });
  await source.initialize();
  await source.query('CREATE EXTENSION IF NOT EXISTS citext');

  // Simulate the original schema and verify migration of a legacy session.
  await source.query(`CREATE TABLE users (id UUID PRIMARY KEY)`);
  await source.query(`CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "UQ_refresh_tokens_user_id" UNIQUE(user_id)
  )`);
  const legacyUser = randomUUID();
  await source.query('INSERT INTO users VALUES ($1)', [legacyUser]);
  await source.query(
    `INSERT INTO refresh_tokens(user_id, token_hash, expires_at)
    VALUES ($1, 'legacy-hash', now() + interval '1 day')`,
    [legacyUser],
  );
  const migration = await readFile(
    new URL('../migrations/20261029_refresh_families.sql', import.meta.url),
    'utf8',
  );
  await source.query(migration);
  const [legacy] = await source.query('SELECT * FROM refresh_tokens');
  assert.ok(legacy.revoked_at);
  assert.ok(legacy.jti && legacy.family_id && legacy.device_id);
  assert.equal(
    (await source.query('SELECT * FROM refresh_families')).length,
    1,
  );
  // Running it again must preserve the migrated records.
  await source.query(migration);
  assert.equal((await source.query('SELECT * FROM refresh_tokens')).length, 1);
  await source.query(
    'TRUNCATE refresh_tokens, refresh_families, users CASCADE',
  );
  await source.synchronize();
  passed++;

  const user = await source.manager.save(Users, {
    email: 'test@example.com',
    password_hash: 'password-hash',
    email_verified_at: new Date(),
  });
  const refreshTokens = new RefreshTokenService(hasher, {}, jwt, config);
  const service = new AuthService(
    jwt,
    config,
    {},
    refreshTokens,
    source.manager,
    hasher,
    {},
  );
  const login = (deviceId = device.deviceId) =>
    service.login({ id: user.id }, { ...device, deviceId });
  const payload = (raw) => jwt.verifyAsync(raw, config);
  const tokenRow = async (raw) =>
    source.manager.findOneByOrFail(RefreshTokens, {
      jti: (await payload(raw)).jti,
    });
  const familyRow = async (raw) =>
    source.manager.findOneByOrFail(RefreshFamilies, {
      id: (await tokenRow(raw)).family_id,
    });
  const rejects = (promise) =>
    assert.rejects(
      promise,
      (error) =>
        error.getStatus() === 401 &&
        error.getResponse().error.code === 'INVALID_REFRESH_TOKEN',
    );

  const phone = await login();
  const laptop = await login(randomUUID());
  const newPhone = await login();
  assert.equal(await source.manager.count(RefreshFamilies), 3);
  const next = await service.refresh({ refresh_token: phone.refresh_token });
  assert.equal(
    (await tokenRow(phone.refresh_token)).family_id,
    (await tokenRow(next.refresh_token)).family_id,
  );
  assert.ok((await tokenRow(phone.refresh_token)).used_at);
  await rejects(service.refresh({ refresh_token: phone.refresh_token }));
  assert.ok((await familyRow(next.refresh_token)).revoked_at);
  await rejects(service.refresh({ refresh_token: next.refresh_token }));
  await service.refresh({ refresh_token: laptop.refresh_token });
  await service.refresh({ refresh_token: newPhone.refresh_token });
  passed++;

  const logoutFirst = await login();
  const logoutNext = await service.refresh({
    refresh_token: logoutFirst.refresh_token,
  });
  await service.logout(logoutFirst.refresh_token);
  await service.logout(logoutFirst.refresh_token);
  await rejects(service.refresh({ refresh_token: logoutNext.refresh_token }));
  passed++;

  const duplicate = await login();
  const results = await Promise.allSettled([
    service.refresh({ refresh_token: duplicate.refresh_token }),
    service.refresh({ refresh_token: duplicate.refresh_token }),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
  const winner = results.find((item) => item.status === 'fulfilled').value;
  assert.ok((await familyRow(winner.refresh_token)).revoked_at);
  await rejects(service.refresh({ refresh_token: winner.refresh_token }));
  passed++;

  for (let attempt = 0; attempt < 5; attempt++) {
    const racing = await login();
    const outcomes = await Promise.allSettled([
      service.refresh({ refresh_token: racing.refresh_token }),
      service.logout(racing.refresh_token),
    ]);
    assert.equal(outcomes[1].status, 'fulfilled');
    assert.ok((await familyRow(racing.refresh_token)).revoked_at);
    if (outcomes[0].status === 'fulfilled') {
      await rejects(
        service.refresh({ refresh_token: outcomes[0].value.refresh_token }),
      );
    }
  }
  passed++;

  const previous = await login();
  const [fresh] = await Promise.all([
    login(),
    service.logout(previous.refresh_token),
  ]);
  await service.refresh({ refresh_token: fresh.refresh_token });
  passed++;

  // Force an insert failure after marking the old token used: both changes roll back.
  const rollback = await login();
  await source.query(`CREATE FUNCTION reject_rotation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected rotation failure'; END $$`);
  await source.query(`CREATE TRIGGER reject_rotation BEFORE INSERT ON refresh_tokens
    FOR EACH ROW EXECUTE FUNCTION reject_rotation()`);
  await assert.rejects(
    service.refresh({ refresh_token: rollback.refresh_token }),
    /injected rotation failure/,
  );
  assert.equal((await tokenRow(rollback.refresh_token)).used_at, null);
  await source.query('DROP TRIGGER reject_rotation ON refresh_tokens');
  await service.refresh({ refresh_token: rollback.refresh_token });
  passed++;

  // logout-all revokes every live family, one already logged out keeps its time
  const loggedOut = await login();
  await service.logout(loggedOut.refresh_token);
  const loggedOutAt = (await familyRow(loggedOut.refresh_token)).revoked_at;
  const otherDevice = await login(randomUUID());
  await service.logoutAll(user.id);
  await rejects(service.refresh({ refresh_token: otherDevice.refresh_token }));
  assert.deepEqual(
    (await familyRow(loggedOut.refresh_token)).revoked_at,
    loggedOutAt,
  );
  assert.equal(
    await source.manager.countBy(RefreshFamilies, {
      user_id: user.id,
      revoked_at: IsNull(),
    }),
    0,
  );
  passed++;

  for (let attempt = 0; attempt < 5; attempt++) {
    const racing = await login();
    const outcomes = await Promise.allSettled([
      service.refresh({ refresh_token: racing.refresh_token }),
      service.logoutAll(user.id),
    ]);
    assert.equal(outcomes[1].status, 'fulfilled');
    assert.ok((await familyRow(racing.refresh_token)).revoked_at);
    if (outcomes[0].status === 'fulfilled') {
      await rejects(
        service.refresh({ refresh_token: outcomes[0].value.refresh_token }),
      );
    }
  }
  const afterLogoutAll = await login();
  await service.refresh({ refresh_token: afterLogoutAll.refresh_token });
  passed++;

  await source.manager.delete(Users, user.id);
  assert.equal(await source.manager.count(RefreshFamilies), 0);
  assert.equal(await source.manager.count(RefreshTokens), 0);
  passed++;
  console.log(
    `${passed} PostgreSQL scenarios passed (migration, devices, rotation/reuse, logout, concurrency, rollback, logout-all, cascade).`,
  );
} finally {
  if (source?.isInitialized) await source.destroy();
  if (created) await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
}
