import 'reflect-metadata';
import { QueryFailedError } from 'typeorm';
import { OAuthService } from './oauth.service.js';
import { GoogleAccounts } from './entities/google-accounts.entity.js';
import { Users } from '../user/entities/user.entity.js';

const principal = {
  id: 'google-subject',
  email: ' Ada@Example.test ',
  email_verified: true,
};

function setup(error: Error) {
  let rolledBack = false;
  const manager = {
    findOne: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockRejectedValue(error),
  };
  const outer = {
    transaction: vi.fn(async (callback: (m: typeof manager) => unknown) => {
      try {
        return await callback(manager);
      } catch (failure) {
        rolledBack = true;
        throw failure;
      }
    }),
    findOne: vi.fn(async (): Promise<unknown> => {
      expect(rolledBack).toBe(true);
      return null;
    }),
  };
  return { service: new OAuthService(outer as never), outer };
}

function uniqueError() {
  return new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('duplicate'), { code: '23505' }),
  );
}

describe('Google first-sign-in race recovery', () => {
  it('returns the winning Google account after rollback', async () => {
    const { service, outer } = setup(uniqueError());
    const find = outer.findOne.getMockImplementation()!;
    outer.findOne.mockImplementation(async () => {
      await find();
      return { users_id: { id: 'winning-user' } };
    });
    await expect(service.oauth({ user: principal })).resolves.toEqual({
      id: 'winning-user',
      is_new_user: false,
    });
    expect(outer.findOne).toHaveBeenCalledWith(GoogleAccounts, {
      where: { google_user_id: principal.id },
      relations: { users_id: true },
    });
  });

  it('requires linking when only the email belongs to an existing account', async () => {
    const { service, outer } = setup(uniqueError());
    const find = outer.findOne.getMockImplementation()!;
    outer.findOne.mockImplementation(async (entity?: unknown) => {
      await find();
      return entity === Users ? { id: 'email-owner' } : null;
    });
    await expect(service.oauth({ user: principal })).rejects.toMatchObject({
      response: { error: { code: 'LINK_REQUIRED' } },
    });
    expect(outer.findOne).toHaveBeenCalledWith(Users, {
      where: { email: 'ada@example.test' },
    });
  });

  it('preserves an unexplained unique violation', async () => {
    const error = uniqueError();
    const { service } = setup(error);
    await expect(service.oauth({ user: principal })).rejects.toBe(error);
  });

  it.each([
    new Error('database unavailable'),
    new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('failure'), { code: '23503' }),
    ),
  ])('preserves unrelated persistence errors', async (error) => {
    const { service, outer } = setup(error);
    await expect(service.oauth({ user: principal })).rejects.toBe(error);
    expect(outer.findOne).not.toHaveBeenCalled();
  });
});
