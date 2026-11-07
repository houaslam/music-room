import 'reflect-metadata';
import { QueryFailedError } from 'typeorm';
import { FriendsService } from './friends.service.js';
import { FriendshipStatus } from './entities/friends-enum.entity.js';

const actor = 'actor';
const target = 'target';
const pending = {
  id: 'request',
  requester_id: actor,
  addressee_id: target,
  status: FriendshipStatus.PENDING,
};

describe('Friends transaction recovery', () => {
  function setup(error: Error, row: unknown) {
    let rolledBack = false;
    const manager = {
      transaction: vi.fn(async () => {
        rolledBack = true;
        throw error;
      }),
      findOne: vi.fn().mockResolvedValue({ id: target, user_id: target }),
    };
    const repo = {
      findOne: vi.fn(async () => {
        expect(rolledBack).toBe(true);
        return row;
      }),
    };
    const service = new FriendsService(repo as never, manager as never);
    return { service, repo };
  }
  function unique() {
    return new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('duplicate'), { code: '23505' }),
    );
  }
  it('recovers a same-direction duplicate only after rollback', async () => {
    const { service } = setup(unique(), pending);
    await expect(service.sendRequest(actor, target)).resolves.toMatchObject({
      created: false,
      friendship: { id: 'request' },
    });
  });
  it.each([
    [
      { ...pending, requester_id: target, addressee_id: actor },
      'INCOMING_REQUEST_EXISTS',
    ],
    [{ ...pending, status: FriendshipStatus.ACCEPTED }, 'ALREADY_FRIENDS'],
    [{ ...pending, status: FriendshipStatus.BLOCKED }, 'USER_NOT_FOUND'],
  ])('maps the winning pair state (%s)', async (row, code) => {
    const { service } = setup(unique(), row);
    await expect(service.sendRequest(actor, target)).rejects.toMatchObject({
      response: { error: { code } },
    });
  });
  it('preserves unexplained uniqueness errors', async () => {
    const error = unique();
    const { service } = setup(error, null);
    await expect(service.sendRequest(actor, target)).rejects.toBe(error);
  });
  it('preserves unrelated database errors', async () => {
    const error = new Error('database offline');
    const { service, repo } = setup(error, null);
    await expect(service.sendRequest(actor, target)).rejects.toBe(error);
    expect(repo.findOne).not.toHaveBeenCalled();
  });
  it('rejects self-targeting before starting a transaction', async () => {
    const { service } = setup(new Error(), null);
    await expect(service.sendRequest(actor, actor)).rejects.toMatchObject({
      response: { error: { code: 'SELF_FRIENDSHIP' } },
    });
  });
});
