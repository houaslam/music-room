import 'reflect-metadata';
import { HeadersGuard } from './headers.guard.js';

const context = (platform: string) => {
  const req = {
    headers: {
      'x-platform': platform,
      'x-device-model': 'Web browser',
      'x-app-version': '1.0.0',
      'x-device-id': '11111111-1111-4111-8111-111111111111',
    },
    device: undefined as any,
  };
  return {
    req,
    execution: { switchToHttp: () => ({ getRequest: () => req }) },
  };
};

it.each(['web', 'ios', 'android'])(
  'accepts valid %s client metadata',
  async (platform) => {
    const { req, execution } = context(platform);
    await expect(
      new HeadersGuard().canActivate(execution as never),
    ).resolves.toBe(true);
    expect(req.device.platform).toBe(platform);
  },
);

it('continues to reject unsupported client platforms', async () => {
  const { execution } = context('invalid');
  await expect(
    new HeadersGuard().canActivate(execution as never),
  ).rejects.toMatchObject({
    status: 400,
    response: { error: { code: 'MISSING_CLIENT_HEADERS' } },
  });
});
