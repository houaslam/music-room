import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from './user.service.js';
import { Users } from './entities/user.entity.js';

describe('UserService', () => {
  let service: UserService;
  const repository = { findOne: vi.fn(), create: vi.fn(), save: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(Users), useValue: repository },
      ],
    }).compile();
    service = module.get(UserService);
  });

  it('rejects duplicate email without creating another account', async () => {
    repository.findOne.mockResolvedValue({ id: 'existing-user' });
    await expect(
      service.create({
        email: 'person@example.com',
        password_hash: 'hash',
        display_name: 'Person',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: 'EMAIL_TAKEN' } },
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('persists a new account when the email is unused', async () => {
    const input = {
      email: 'person@example.com',
      password_hash: 'hash',
      display_name: 'Person',
    };
    repository.findOne.mockResolvedValue(null);
    repository.create.mockReturnValue(input);
    repository.save.mockResolvedValue({ id: 'new-user', ...input });
    await expect(service.create(input)).resolves.toMatchObject({
      id: 'new-user',
      email: input.email,
    });
    expect(repository.save).toHaveBeenCalledWith(input);
  });

  it('propagates a persistence failure instead of reporting success', async () => {
    repository.findOne.mockResolvedValue(null);
    repository.create.mockReturnValue({});
    repository.save.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.create({
        email: 'person@example.com',
        password_hash: 'hash',
        display_name: 'Person',
      }),
    ).rejects.toThrow('database unavailable');
  });
});
