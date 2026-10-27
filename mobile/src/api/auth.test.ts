import { deleteAccount, register } from './auth';
import { request } from './client';

jest.mock('./client', () => ({ request: jest.fn() }));

const requestMock = jest.mocked(request);

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

describe('deleteAccount', () => {
  it('sends the user id to DELETE /auth/delete', async () => {
    requestMock.mockResolvedValue({ message: 'User Deleted Successfully' });

    await deleteAccount('abc');

    expect(requestMock).toHaveBeenCalledWith('/auth/delete', {
      method: 'DELETE',
      body: { id: 'abc' },
    });
  });
});
