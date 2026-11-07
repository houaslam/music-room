import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { FriendsController } from './friends.controller.js';
import { FriendsService } from './friends.service.js';
import { JWTGuard } from '../auth/guards/jwt.guard.js';

const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const headers = {
  Authorization: 'Bearer test',
  'X-Platform': 'ios',
  'X-Device-Model': 'Test phone',
  'X-App-Version': '1.0.0',
  'X-Device-Id': actor,
};
const service = {
  listFriends: vi.fn().mockResolvedValue({ items: [] }),
  searchUsers: vi.fn().mockResolvedValue({ items: [] }),
  listRequests: vi.fn().mockResolvedValue({ items: [] }),
  sendRequest: vi.fn(),
  acceptRequest: vi.fn().mockResolvedValue({ id, status: 'accepted' }),
  declineRequest: vi.fn().mockResolvedValue(undefined),
  getRelationship: vi
    .fn()
    .mockResolvedValue({
      user_id: target,
      id: null,
      relationship_status: 'none',
    }),
  deleteFriendship: vi.fn().mockResolvedValue(undefined),
};

describe('Friends HTTP contract', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 999 }])],
      controllers: [FriendsController],
      providers: [{ provide: FriendsService, useValue: service }],
    })
      .overrideGuard(JWTGuard)
      .useValue({
        canActivate(context: any) {
          const req = context.switchToHttp().getRequest();
          if (req.headers.authorization !== 'Bearer test')
            throw new UnauthorizedException();
          req.user = actor;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication and client headers', async () => {
    await request(app.getHttpServer()).get('/friends').expect(401);
    const res = await request(app.getHttpServer())
      .get('/friends')
      .set('Authorization', 'Bearer test')
      .expect(400);
    expect(res.body.error.code).toBe('MISSING_CLIENT_HEADERS');
  });

  it('routes and validates all list queries', async () => {
    await request(app.getHttpServer())
      .get('/friends')
      .set(headers)
      .expect(200, { items: [] });
    await request(app.getHttpServer())
      .get('/friends?limit=5')
      .set(headers)
      .expect(400);
    await request(app.getHttpServer())
      .get('/friends/users')
      .set(headers)
      .expect(400);
    await request(app.getHttpServer())
      .get('/friends/users?display_name=a')
      .set(headers)
      .expect(400);
    await request(app.getHttpServer())
      .get('/friends/users')
      .query({ display_name: '  Cafe\u0301  ' })
      .set(headers)
      .expect(200);
    expect(service.searchUsers).toHaveBeenLastCalledWith(actor, 'Café');
    await request(app.getHttpServer())
      .get('/friends/requests')
      .set(headers)
      .expect(200);
    expect(service.listRequests).toHaveBeenLastCalledWith(actor, 'incoming');
    await request(app.getHttpServer())
      .get('/friends/requests?direction=outgoing')
      .set(headers)
      .expect(200);
    expect(service.listRequests).toHaveBeenLastCalledWith(actor, 'outgoing');
    await request(app.getHttpServer())
      .get('/friends/requests?direction=invalid')
      .set(headers)
      .expect(400);
  });

  it('rejects missing, malformed and forged request fields', async () => {
    for (const body of [
      {},
      { addressee_id: 'bad' },
      { addressee_id: target, requester_id: actor },
    ]) {
      const res = await request(app.getHttpServer())
        .post('/friends/requests')
        .set(headers)
        .send(body)
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('distinguishes created requests from repeat requests', async () => {
    service.sendRequest
      .mockResolvedValueOnce({ created: true, friendship: { id } })
      .mockResolvedValueOnce({ created: false, friendship: { id } });
    await request(app.getHttpServer())
      .post('/friends/requests')
      .set(headers)
      .send({ addressee_id: target })
      .expect(201, { id });
    await request(app.getHttpServer())
      .post('/friends/requests')
      .set(headers)
      .send({ addressee_id: target })
      .expect(200, { id });
    expect(service.sendRequest).toHaveBeenLastCalledWith(actor, target);
  });

  it('routes mutations with validated IDs and empty 204 responses', async () => {
    await request(app.getHttpServer())
      .patch(`/friends/requests/${id}/accept`)
      .set(headers)
      .expect(200);
    expect(service.acceptRequest).toHaveBeenLastCalledWith(actor, id);
    await request(app.getHttpServer())
      .patch('/friends/requests/bad/accept')
      .set(headers)
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/friends/requests/${id}/accept`)
      .set(headers)
      .send({ status: 'accepted' })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/friends/requests/${id}`)
      .set(headers)
      .expect(204, '');
    expect(service.declineRequest).toHaveBeenLastCalledWith(actor, id);
    await request(app.getHttpServer())
      .get(`/friends/relationships/${target}`)
      .set(headers)
      .expect(200);
    expect(service.getRelationship).toHaveBeenLastCalledWith(actor, target);
    await request(app.getHttpServer())
      .delete(`/friends/${target}`)
      .set(headers)
      .expect(204, '');
    expect(service.deleteFriendship).toHaveBeenLastCalledWith(actor, target);
    await request(app.getHttpServer())
      .delete('/friends/not-a-uuid')
      .set(headers)
      .expect(400);
  });

  it('enforces each route limit independently and includes Retry-After', async () => {
    service.sendRequest.mockResolvedValue({
      created: false,
      friendship: { id },
    });
    const routes = [
      ['get', '/friends', 60],
      ['get', '/friends/users?display_name=Sam', 30],
      ['get', '/friends/requests', 60],
      ['post', '/friends/requests', 20],
      ['patch', `/friends/requests/${id}/accept`, 30],
      ['delete', `/friends/requests/${id}`, 30],
      ['get', `/friends/relationships/${target}`, 60],
      ['delete', `/friends/${target}`, 30],
    ] as const;
    for (const [method, path, limit] of routes) {
      // Earlier calls count too; every route must block by its own stated limit.
      let blocked = false;
      for (let i = 0; i <= limit; i++) {
        const call = request(app.getHttpServer())[method](path).set(headers);
        const res = await (method === 'post'
          ? call.send({ addressee_id: target })
          : call);
        if (res.status === 429) {
          expect(res.body.error.code).toBe('RATE_LIMITED');
          expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
          blocked = true;
          break;
        }
        expect(res.status).toBeLessThan(400);
      }
      expect(blocked, `${method} ${path}`).toBe(true);
    }
  });
});
