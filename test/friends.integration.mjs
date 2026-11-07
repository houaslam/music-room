// Uses a disposable database on an explicitly supplied test PostgreSQL server.
// npm run build && FRIENDS_TEST_DB_HOST=127.0.0.1 node test/friends.integration.mjs
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { FriendsService } from '../dist/friends/friends.service.js';
import { Friendships } from '../dist/friends/entities/friends.entity.js';
import { Users } from '../dist/user/entities/user.entity.js';
import { Profiles } from '../dist/profile/entities/profiles.entity.js';

if (!process.env.FRIENDS_TEST_DB_HOST)
  throw new Error('Set FRIENDS_TEST_DB_HOST to a test PostgreSQL server.');
const connection = {
  host: process.env.FRIENDS_TEST_DB_HOST,
  port: Number(process.env.FRIENDS_TEST_DB_PORT ?? 5432),
  user: process.env.FRIENDS_TEST_DB_USER ?? process.env.USER,
  password: process.env.FRIENDS_TEST_DB_PASSWORD,
};
const database = `music_room_friends_test_${randomUUID().replaceAll('-', '')}`;
const admin = new Client({ ...connection, database: 'postgres' });
let source;
let created = false;
let passed = 0;
const check = async (name, run) => {
  await run();
  passed++;
  console.log(`PASS ${name}`);
};
const code = (expected) => (error) => error.response?.error?.code === expected;
await admin.connect();
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const bootstrap = new Client({ ...connection, database });
  await bootstrap.connect();
  await bootstrap.query('CREATE EXTENSION IF NOT EXISTS citext');
  await bootstrap.end();
  source = new DataSource({
    type: 'postgres',
    host: connection.host,
    port: connection.port,
    username: connection.user,
    password: connection.password,
    database,
    entities: [Users, Profiles, Friendships],
    synchronize: false,
  });
  await source.initialize();
  await source.synchronize();
  const migration = await readFile(
    new URL('../migrations/20261104_friendships.sql', import.meta.url),
    'utf8',
  );
  await source.query(migration);
  await check(
    'migration is repeatable and expression index survives schema sync',
    async () => {
      await source.query(migration);
      await source.synchronize();
      const rows = await source.query(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'friendships' AND indexname = 'friendships_pair_idx'",
      );
      assert.equal(rows.length, 1);
    },
  );
  const repo = source.getRepository(Friendships);
  const service = new FriendsService(repo, source.manager);
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const [a, b, c, d, noProfile] = ids;
  for (let i = 0; i < ids.length; i++) {
    await source.manager.save(Users, {
      id: ids[i],
      email: `user-${i}@example.test`,
      display_name: 'Outdated user name',
    });
    if (i < 4)
      await source.manager.save(Profiles, {
        user_id: ids[i],
        display_name: ['Alex', 'Sam', 'Samantha', 'A%_quote'][i],
        avatar_url: null,
      });
  }
  const reset = () => repo.createQueryBuilder().delete().execute();

  await check(
    'search discovers strangers by profile name and returns safe fields',
    async () => {
      const { items } = await service.searchUsers(a, 'sam');
      assert.deepEqual(
        items.map((user) => user.display_name),
        ['Sam', 'Samantha'],
      );
      assert.deepEqual(Object.keys(items[0]).sort(), [
        'avatar_url',
        'display_name',
        'id',
        'relationship_status',
        'user_id',
      ]);
      assert.ok(
        items.every(
          (user) => user.relationship_status === 'none' && user.id === null,
        ),
      );
      assert.equal((await service.searchUsers(a, 'Alex')).items.length, 0);
    },
  );
  await check(
    'search treats wildcard characters as literal input',
    async () => {
      assert.deepEqual(
        (await service.searchUsers(a, '%_')).items.map((user) => user.user_id),
        [d],
      );
      assert.equal(
        (await service.searchUsers(a, "' OR 1=1 --")).items.length,
        0,
      );
    },
  );
  await check('empty lists use the items envelope', async () => {
    assert.deepEqual(await service.listFriends(a), { items: [] });
    assert.deepEqual(await service.listRequests(a), { items: [] });
  });
  await check(
    'send, repeat and crossed request follow the contract',
    async () => {
      const first = await service.sendRequest(a, b);
      const repeat = await service.sendRequest(a, b);
      assert.equal(first.created, true);
      assert.equal(repeat.created, false);
      assert.deepEqual(first.friendship, repeat.friendship);
      await assert.rejects(
        service.sendRequest(b, a),
        code('INCOMING_REQUEST_EXISTS'),
      );
      assert.equal(await repo.count(), 1);
      assert.equal(
        (await service.getRelationship(a, b)).relationship_status,
        'outgoing_pending',
      );
      assert.equal(
        (await service.getRelationship(b, a)).relationship_status,
        'incoming_pending',
      );
    },
  );
  await check(
    'request lists identify the other participant and expose only pending rows',
    async () => {
      const incoming = (await service.listRequests(b)).items;
      assert.equal(incoming[0].user.user_id, a);
      assert.equal(incoming[0].user.display_name, 'Alex');
      assert.equal(
        (await service.listRequests(a, 'outgoing')).items[0].user.user_id,
        b,
      );
      assert.deepEqual(await service.listFriends(a), { items: [] });
    },
  );
  await check(
    'only addressee can accept; retries preserve timestamps',
    async () => {
      const row = await repo.findOneByOrFail({
        requester_id: a,
        addressee_id: b,
      });
      await assert.rejects(
        service.acceptRequest(a, row.id),
        code('FRIEND_REQUEST_FORBIDDEN'),
      );
      await assert.rejects(
        service.acceptRequest(c, row.id),
        code('FRIEND_REQUEST_NOT_FOUND'),
      );
      await service.declineRequest(c, row.id);
      assert.equal(await repo.count(), 1);
      const accepted = await service.acceptRequest(b, row.id);
      assert.equal(accepted.status, 'accepted');
      assert.deepEqual(await service.acceptRequest(b, row.id), accepted);
      assert.equal(
        accepted.created_at.toISOString(),
        row.created_at.toISOString(),
      );
      assert.deepEqual(await service.listRequests(b), { items: [] });
      assert.equal((await service.listFriends(a)).items[0].user.user_id, b);
      assert.equal((await service.listFriends(b)).items[0].user.user_id, a);
      await assert.rejects(service.sendRequest(b, a), code('ALREADY_FRIENDS'));
      await assert.rejects(
        service.declineRequest(a, row.id),
        code('FRIEND_REQUEST_NOT_PENDING'),
      );
    },
  );
  await check(
    'unfriend is symmetric, repeatable and old request IDs stay invalid',
    async () => {
      const row = await repo.findOneByOrFail({
        requester_id: a,
        addressee_id: b,
      });
      await service.deleteFriendship(b, a);
      await service.deleteFriendship(b, a);
      assert.deepEqual(await service.listFriends(a), { items: [] });
      const next = await service.sendRequest(b, a);
      assert.notEqual(next.friendship.id, row.id);
      await assert.rejects(
        service.acceptRequest(b, row.id),
        code('FRIEND_REQUEST_NOT_FOUND'),
      );
      await service.deleteFriendship(a, b); // pending is unchanged
      assert.equal(await repo.count(), 1);
      await service.declineRequest(a, next.friendship.id);
      await service.declineRequest(a, next.friendship.id);
      assert.equal(await repo.count(), 0);
    },
  );
  await check(
    'self, unknown and profile-less targets are rejected',
    async () => {
      await assert.rejects(service.sendRequest(a, a), code('SELF_FRIENDSHIP'));
      await assert.rejects(
        service.getRelationship(a, a),
        code('SELF_FRIENDSHIP'),
      );
      await assert.rejects(
        service.deleteFriendship(a, a),
        code('SELF_FRIENDSHIP'),
      );
      await assert.rejects(
        service.sendRequest(a, noProfile),
        code('USER_NOT_FOUND'),
      );
      await assert.rejects(
        service.sendRequest(a, randomUUID()),
        code('USER_NOT_FOUND'),
      );
      await service.deleteFriendship(a, randomUUID());
    },
  );
  await check('blocked pairs are hidden and cannot be mutated', async () => {
    const row = await repo.save({
      requester_id: a,
      addressee_id: b,
      status: 'blocked',
    });
    assert.equal(
      (await service.searchUsers(a, 'Sam')).items.some(
        (user) => user.user_id === b,
      ),
      false,
    );
    assert.deepEqual(await service.listRequests(b), { items: [] });
    assert.deepEqual(await service.listFriends(a), { items: [] });
    await assert.rejects(service.sendRequest(b, a), code('USER_NOT_FOUND'));
    await assert.rejects(service.getRelationship(a, b), code('USER_NOT_FOUND'));
    await assert.rejects(
      service.acceptRequest(b, row.id),
      code('FRIEND_REQUEST_NOT_FOUND'),
    );
    await service.declineRequest(a, row.id);
    await service.deleteFriendship(b, a);
    assert.equal(
      (await repo.findOneByOrFail({ id: row.id })).status,
      'blocked',
    );
    await reset();
  });
  await check('concurrent same-direction sends create one row', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => service.sendRequest(a, b)),
    );
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(
      new Set(results.map((result) => result.friendship.id)).size,
      1,
    );
    assert.equal(await repo.count(), 1);
    await reset();
  });
  await check(
    'concurrent opposite-direction sends require explicit acceptance',
    async () => {
      const results = await Promise.allSettled([
        service.sendRequest(a, b),
        service.sendRequest(b, a),
      ]);
      assert.equal(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      const failed = results.find((result) => result.status === 'rejected');
      assert.equal(
        failed.reason.response.error.code,
        'INCOMING_REQUEST_EXISTS',
      );
      assert.equal((await repo.find())[0].status, 'pending');
      await reset();
    },
  );
  await check('accept versus cancel has a serial outcome', async () => {
    for (let i = 0; i < 5; i++) {
      const { friendship } = await service.sendRequest(a, b);
      const results = await Promise.allSettled([
        service.acceptRequest(b, friendship.id),
        service.declineRequest(a, friendship.id),
      ]);
      const row = await repo.findOneBy({ id: friendship.id });
      if (row) {
        assert.equal(row.status, 'accepted');
        assert.equal(
          results[1].reason.response.error.code,
          'FRIEND_REQUEST_NOT_PENDING',
        );
      } else {
        assert.equal(
          results[0].reason.response.error.code,
          'FRIEND_REQUEST_NOT_FOUND',
        );
      }
      await reset();
    }
  });
  await check(
    'accept versus unfriend cannot leave an invalid state',
    async () => {
      for (let i = 0; i < 5; i++) {
        const { friendship } = await service.sendRequest(a, b);
        await Promise.all([
          service.acceptRequest(b, friendship.id),
          service.deleteFriendship(a, b),
        ]);
        const row = await repo.findOneBy({ id: friendship.id });
        assert.ok(!row || row.status === 'accepted');
        await reset();
      }
    },
  );
  await check(
    'SQL enforces pair uniqueness, self checks and update timestamps',
    async () => {
      const { friendship } = await service.sendRequest(a, b);
      await assert.rejects(
        repo.save({ requester_id: b, addressee_id: a, status: 'pending' }),
        (error) => error.driverError.code === '23505',
      );
      await assert.rejects(
        repo.save({ requester_id: a, addressee_id: a, status: 'pending' }),
        (error) => error.driverError.code === '23514',
      );
      await source.query('SELECT pg_sleep(0.01)');
      await source.query(
        "UPDATE friendships SET status = 'accepted' WHERE id = $1",
        [friendship.id],
      );
      const row = await repo.findOneByOrFail({ id: friendship.id });
      assert.ok(row.updated_at > friendship.updated_at);
      await reset();
    },
  );
  await check(
    'profile gaps are omitted and deleting either account cascades',
    async () => {
      await service.sendRequest(a, c);
      await service.sendRequest(d, c);
      await source.manager.delete(Profiles, { user_id: c });
      assert.deepEqual(await service.listRequests(a, 'outgoing'), {
        items: [],
      });
      await assert.rejects(
        service.getRelationship(a, c),
        code('USER_NOT_FOUND'),
      );
      await source.manager.delete(Users, { id: c });
      assert.equal(await repo.count(), 0);
    },
  );
  console.log(`${passed} PostgreSQL friends checks passed.`);
} finally {
  if (source?.isInitialized) await source.destroy();
  if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  await admin.end();
}
