import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { HeadersGuard } from './guards/headers.guard.js';
import { RateLimitGuard } from './guards/throttle.guard.js';

describe('AuthController', () => {
  let controller: AuthController;
  const service = {
    register: vi.fn(),
    validateUser: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    emailVerification: vi.fn(),
    emailVerificationConfirm: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    // Vitest does not emit constructor metadata like tsc. Supply just this DI hint.
    Reflect.defineMetadata('design:paramtypes', [AuthService], AuthController);
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    })
      .overrideGuard(HeadersGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AuthController);
  });

  it('returns registration results without adding account data', async () => {
    const payload = {
      email: 'person@example.com',
      password: 'Strong-password1!',
      display_name: 'Person',
    };
    service.register.mockResolvedValue({ user_id: 'new-user' });
    await expect(controller.register(payload)).resolves.toEqual({
      user_id: 'new-user',
    });
  });

  it('does not issue tokens after credential validation fails', async () => {
    service.validateUser.mockRejectedValue(new UnauthorizedException());
    await expect(
      controller.login({ email: 'person@example.com', password: 'wrong' }, {
        device: {},
      } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.login).not.toHaveBeenCalled();
  });

  it('passes validated identity and device metadata into session creation', async () => {
    const identity = { id: 'owner' };
    const headers = {
      platform: 'ios',
      deviceModel: 'Phone',
      appVersion: '1.0.0',
      deviceId: 'device',
    };
    const tokens = {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 900,
    };
    service.validateUser.mockResolvedValue(identity);
    service.login.mockResolvedValue(tokens);
    await expect(
      controller.login(
        { email: 'person@example.com', password: 'password' },
        { device: headers },
      ),
    ).resolves.toEqual(tokens);
    expect(service.login).toHaveBeenCalledWith(identity, headers);
  });

  it('logs out using only the supplied refresh token', async () => {
    await expect(
      controller.logout({ refresh_token: 'token' }),
    ).resolves.toBeUndefined();
    expect(service.logout).toHaveBeenCalledWith('token');
  });

  it('propagates rejected refresh tokens without returning credentials', async () => {
    service.refresh.mockRejectedValue(new UnauthorizedException());
    await expect(
      controller.refresh({ refresh_token: 'invalid' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
