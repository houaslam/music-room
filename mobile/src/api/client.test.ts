import { API_URL, ApiError, request } from './client';

jest.mock('../device', () => ({
  getDeviceHeaders: () =>
    Promise.resolve({
      'X-Platform': 'android',
      'X-Device-Model': 'Pixel 7',
      'X-App-Version': '1.0.0',
      'X-Device-Id': '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    }),
}));

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  jest.useRealTimers();
});

// only the parts of Response that client.ts uses
function fakeResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined)
        throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
  };
}

async function requestError(path = '/auth/register') {
  try {
    await request(path, { method: 'POST', body: {} });
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('request should have failed');
}

describe('request', () => {
  it('sends the body as json with the device headers', async () => {
    fetchMock.mockResolvedValue(fakeResponse(201, { user_id: 'abc' }));

    await request('/auth/register', {
      method: 'POST',
      body: { email: 'adam@test.com' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/auth/register`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'adam@test.com' }),
        headers: {
          'Content-Type': 'application/json',
          'X-Platform': 'android',
          'X-Device-Model': 'Pixel 7',
          'X-App-Version': '1.0.0',
          'X-Device-Id': '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        },
      }),
    );
  });

  it('returns the parsed response body', async () => {
    fetchMock.mockResolvedValue(fakeResponse(201, { user_id: 'abc' }));

    const data = await request('/auth/register', { method: 'POST', body: {} });

    expect(data).toEqual({ user_id: 'abc' });
  });

  it('returns null when the response has no body', async () => {
    fetchMock.mockResolvedValue(fakeResponse(204));

    const data = await request('/auth/logout', { method: 'POST' });

    expect(data).toBeNull();
  });

  it('adds the access token as a bearer header when given one', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, {}));

    await request('/auth/me', { method: 'GET', token: 'access-1' });

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer access-1',
      'X-Device-Id': '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    });
  });

  it('sends no Authorization header without a token', async () => {
    fetchMock.mockResolvedValue(fakeResponse(201, {}));

    await request('/auth/register', { method: 'POST', body: {} });

    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty(
      'Authorization',
    );
  });
});

describe('request errors', () => {
  it('reads code and message from the backend error', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(409, {
        message: 'Email is already taken!',
        code: 'EMAIL_TAKEN',
      }),
    );

    const err = await requestError();

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
      message: 'Email is already taken!',
    });
  });

  it('also reads the { error: { code, message } } format from the contract', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(400, {
        error: { code: 'TOKEN_EXPIRED', message: 'Token expired' },
      }),
    );

    const err = await requestError();

    expect(err).toMatchObject({
      status: 400,
      code: 'TOKEN_EXPIRED',
      message: 'Token expired',
    });
  });

  it('turns ValidationPipe errors into VALIDATION_ERROR with every message', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(400, {
        statusCode: 400,
        message: [
          'email must be an email',
          'password must be longer than or equal to 8 characters',
        ],
        error: 'Bad Request',
      }),
    );

    const err = await requestError();

    expect(err).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message:
        'email must be an email\npassword must be longer than or equal to 8 characters',
    });
  });

  it('shows every field message from the VALIDATION_ERROR details', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: [
            { fields: 'email', message: ['email must be an email'] },
            {
              fields: 'password',
              message: [
                'password must be longer than or equal to 8 characters',
              ],
            },
          ],
        },
      }),
    );

    const err = await requestError();

    expect(err).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message:
        'email must be an email\npassword must be longer than or equal to 8 characters',
    });
  });

  it('keeps MISSING_CLIENT_HEADERS from the headers guard', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(400, {
        code: 'MISSING_CLIENT_HEADERS',
        message: 'Header validation failed',
        errors: ['X-Device-Id must be a valid UUID'],
      }),
    );

    const err = await requestError();

    expect(err).toMatchObject({
      status: 400,
      code: 'MISSING_CLIENT_HEADERS',
      message: 'Header validation failed',
    });
  });

  it('uses RATE_LIMITED for a 429 without a code', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(429, {
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
      }),
    );

    const err = await requestError();

    expect(err).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
  });

  it('uses INTERNAL_ERROR for a 500', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(500, { statusCode: 500, message: 'Internal server error' }),
    );

    const err = await requestError();

    expect(err).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  it('uses HTTP_<status> for any other status without a code', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(404, {
        statusCode: 404,
        message: 'Cannot POST /api/v1/auth/nope',
        error: 'Not Found',
      }),
    );

    const err = await requestError('/auth/nope');

    expect(err).toMatchObject({
      status: 404,
      code: 'HTTP_404',
      message: 'Cannot POST /api/v1/auth/nope',
    });
  });

  it('still fails cleanly when the error body is not json', async () => {
    // e.g. an html page from a proxy in front of the api
    fetchMock.mockResolvedValue(fakeResponse(502));

    const err = await requestError();

    expect(err).toMatchObject({
      status: 502,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on the server.',
    });
  });

  it('uses NETWORK_ERROR when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    const err = await requestError();

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('gives up with TIMEOUT when the server takes too long', async () => {
    jest.useFakeTimers();
    // a fetch that never answers, it only stops when the request is aborted
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new Error('Aborted')),
          );
        }),
    );

    const pending = requestError();
    await jest.advanceTimersByTimeAsync(10_000);
    const err = await pending;

    expect(err).toMatchObject({ status: 0, code: 'TIMEOUT' });
  });
});
