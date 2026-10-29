import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProfileService } from './profile.service.js';
import { Profiles } from './entities/profiles.entity.js';

describe('ProfileService', () => {
  let service: ProfileService;
  const repository = { create: vi.fn(), save: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: getRepositoryToken(Profiles), useValue: repository },
      ],
    }).compile();
    service = module.get(ProfileService);
    repository.create.mockImplementation((value) => value);
    repository.save.mockImplementation(async (value) => value);
  });

  it('creates a profile belonging to the supplied authenticated user', async () => {
    await expect(
      service.create('owner-id', { display_name: 'Hajar' }),
    ).resolves.toMatchObject({ user_id: 'owner-id', display_name: 'Hajar' });
  });

  it('does not let payload data replace the authenticated owner', async () => {
    const payload = { display_name: 'Hajar', user_id: 'another-user' };
    await expect(service.create('owner-id', payload)).resolves.toMatchObject({
      user_id: 'owner-id',
    });
  });

  it('reports persistence failure rather than a created profile', async () => {
    repository.save.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.create('owner-id', { display_name: 'Hajar' }),
    ).rejects.toThrow('database unavailable');
  });
});
