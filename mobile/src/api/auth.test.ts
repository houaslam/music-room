import {
  confirmEmail,
  deleteAccount,
  login,
  logout,
  logoutAll,
  me,
  refresh,
  register,
  resendCode,
} from './auth';
import { request } from './client';

jest.mock('./client', () => ({ request: jest.fn() }));

const requestMock = jest.mocked(request);

const tokens = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 900,
};

beforeEach(() => {
  requestMock.mockReset();
});

describe('register', () => {
  it('posts the form to /auth/register and returns the new user id', async () => {
    requestMock.mockResolvedValue({ user_id: 'abc' });

    const result = await register({
      email: 'adam@test.com',
      password: 'password123',
      display_name: 'adam',
    });

    expect(requestMock).toHaveBeenCalledWith('/auth/register', {
      method: 'POST',
      body: {
        email: 'adam@test.com',
        password: 'password123',
        display_name: 'adam',
      },
    });
    expect(result).toEqual({ user_id: 'abc' });
  });

  it('lets errors from the request go up to the screen', async () => {
    requestMock.mockRejectedValue(new Error('EMAIL_TAKEN'));

    await expect(
      register({
        email: 'adam@test.com',
        password: 'password123',
        display_name: 'adam',
      }),
    ).rejects.toThrow('EMAIL_TAKEN');
  });
});

describe('confirmEmail', () => {
  it('sends the email and the 6 digit code as token', async () => {
    requestMock.mockResolvedValue(null);

    await confirmEmail('adam@test.com', '123456');

    expect(requestMock).toHaveBeenCalledWith(
      '/auth/email-verification/confirm',
      { method: 'POST', body: { email: 'adam@test.com', token: '123456' } },
    );
  });
});

describe('resendCode', () => {
  it('asks for a new code for the email', async () => {
    requestMock.mockResolvedValue(null);

    await resendCode('adam@test.com');

    expect(requestMock).toHaveBeenCalledWith('/auth/email-verification', {
      method: 'POST',
      body: { email: 'adam@test.com' },
    });
  });
});

describe('login', () => {
  it('posts the email and password and returns the tokens', async () => {
    requestMock.mockResolvedValue(tokens);

    const result = await login('adam@test.com', 'password123');

    expect(requestMock).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { email: 'adam@test.com', password: 'password123' },
    });
    expect(result).toEqual(tokens);
  });
});

describe('refresh', () => {
  it('trades the refresh token for new tokens', async () => {
    requestMock.mockResolvedValue(tokens);

    const result = await refresh('refresh-0');

    expect(requestMock).toHaveBeenCalledWith('/auth/refresh', {
      method: 'POST',
      body: { refresh_token: 'refresh-0' },
    });
    expect(result).toEqual(tokens);
  });
});

describe('logout', () => {
  it('sends the refresh token to /auth/logout', async () => {
    requestMock.mockResolvedValue(null);

    await logout('refresh-1');

    expect(requestMock).toHaveBeenCalledWith('/auth/logout', {
      method: 'POST',
      body: { refresh_token: 'refresh-1' },
    });
  });
});

describe('logoutAll', () => {
  it('calls /auth/logout-all with the access token', async () => {
    requestMock.mockResolvedValue(null);

    await logoutAll('access-1');

    expect(requestMock).toHaveBeenCalledWith('/auth/logout-all', {
      method: 'POST',
      token: 'access-1',
    });
  });
});

describe('me', () => {
  it('gets the logged in user with the access token', async () => {
    const user = {
      user_id: 'abc',
      email: 'adam@test.com',
      email_verified: true,
      has_password: true,
      linked_providers: [],
    };
    requestMock.mockResolvedValue(user);

    const result = await me('access-1');

    expect(requestMock).toHaveBeenCalledWith('/auth/me', {
      method: 'GET',
      token: 'access-1',
    });
    expect(result).toEqual(user);
  });
});

describe('deleteAccount', () => {
  it('deletes the account of the access token, no id in the body', async () => {
    requestMock.mockResolvedValue({ message: 'User Deleted Successfully' });

    await deleteAccount('access-1');

    expect(requestMock).toHaveBeenCalledWith('/auth/delete', {
      method: 'DELETE',
      token: 'access-1',
    });
  });
});
