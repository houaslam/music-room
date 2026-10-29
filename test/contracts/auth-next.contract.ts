import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from '../../src/auth/auth.controller.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { JWTStrategy } from '../../src/auth/strategies/jwt.strategy.js';
import { RateLimitGuard } from '../../src/auth/guards/throttle.guard.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Users } from '../../src/user/entities/user.entity.js';

// HTTP routing, header mapping and authentication acceptance checks.
// Only the service persistence boundary and rate limiting are replaced. Header
// validation, routing and JWT verification stay real. No external DB/SMTP is used.
const owner = '7c289d4c-ab51-4ed5-bbd0-d02fb59bc01a';
const victim = '7c289d4c-ab51-4ed5-bbd0-d02fb59bc01b';
const secret = 'local-contract-test-secret-not-for-deployment';
const jwt = new JwtService({ secret });
const headers = {
  'X-Platform': 'ios',
  'X-Device-Model': 'Test phone',
  'X-App-Version': '1.0.0',
  'X-Device-Id': '7c289d4c-ab51-4ed5-bbd0-d02fb59bc01c',
};

describe('Auth HTTP contracts', () => {
  let app: INestApplication;
  const userRepository = { findOne: vi.fn() };
  const service = {
    delete: vi.fn(),
    logout: vi.fn(),
    validateUser: vi.fn(),
    login: vi.fn(),
  };

  beforeAll(async () => {
    Reflect.defineMetadata('design:paramtypes', [AuthService], AuthController);
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: service },
        { provide: getRepositoryToken(Users), useValue: userRepository },
        {
          provide: JWTStrategy,
          inject: [getRepositoryToken(Users)],
          useFactory: (repository: Repository<Users>) =>
            new JWTStrategy(new ConfigService({ ACCESS_TOKEN_SECRET: secret }), repository),
        },
      ],
    })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    vi.resetAllMocks();
    userRepository.findOne.mockResolvedValue({ id: owner });
  });
  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-jwt'],
  ])('GET /auth/me rejects a %s access token', async (_label, token) => {
    const call = request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(headers);
    if (token) call.set('Authorization', `Bearer ${token}`);
    await call.expect(401);
  });

  it('GET /auth/me rejects expired access tokens', async () => {
    const token = jwt.sign({ sub: owner }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(headers)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects a deleted user before reaching the deletion service', async () => {
    userRepository.findOne.mockResolvedValue(null);
    const token = jwt.sign({ sub: owner }, { expiresIn: '1h' });
    await request(app.getHttpServer())
      .delete('/api/v1/auth/delete')
      .set(headers)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: owner } });
    expect(service.delete).not.toHaveBeenCalled();
  });

  it('GET /auth/me rejects tokens signed by another issuer key', async () => {
    const token = jwt.sign(
      { sub: owner },
      { secret: 'wrong-key', expiresIn: '1h' },
    );
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(headers)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('DELETE /auth/delete rejects anonymous deletion before reaching the service', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/auth/delete')
      .set(headers)
      .send({ id: victim })
      .expect(401);
    expect(service.delete).not.toHaveBeenCalled();
  });

  it('DELETE /auth/delete rejects expired authentication before any write', async () => {
    const token = jwt.sign({ sub: owner }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .delete('/api/v1/auth/delete')
      .set(headers)
      .set('Authorization', `Bearer ${token}`)
      .send({ id: victim })
      .expect(401);
    expect(service.delete).not.toHaveBeenCalled();
  });

  it('DELETE /auth/delete cannot pass a victim ID to the deletion service', async () => {
    const token = jwt.sign({ sub: owner }, { expiresIn: '1h' });
    const response = await request(app.getHttpServer())
      .delete('/api/v1/auth/delete')
      .set(headers)
      .set('Authorization', `Bearer ${token}`)
      .send({ id: victim });
    expect(service.delete).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: victim }),
    );
    // Either reject the forged target or ignore it and delete only the owner.
    if (response.status < 400) {
      expect(service.delete).toHaveBeenCalledWith(
        expect.objectContaining({ id: owner }),
      );
    } else {
      expect([400, 403]).toContain(response.status);
    }
  });

  it('maps raw device headers before creating a login session', async () => {
    service.validateUser.mockResolvedValue({ id: owner });
    service.login.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set(headers)
      .send({ email: 'person@example.com', password: 'password' })
      .expect(200);
    expect(service.login).toHaveBeenCalledWith(
      { id: owner },
      expect.objectContaining({
        deviceId: headers['X-Device-Id'],
        platform: 'ios',
        deviceModel: 'Test phone',
        appVersion: '1.0.0',
      }),
    );
  });

  it('allows logout after the access token expires', async () => {
    const expired = jwt.sign({ sub: owner }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set(headers)
      .set('Authorization', `Bearer ${expired}`)
      .send({ refresh_token: 'refresh-token' })
      .expect(204);
    expect(service.logout).toHaveBeenCalledWith('refresh-token');
  });

  it.each(['unknown-token', 'already-revoked-token'])(
    'POST /auth/logout is idempotent for %s',
    async (token) => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set(headers)
        .send({ refresh_token: token })
        .expect(204);
    },
  );
});
