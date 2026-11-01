import { Alert } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import App from './App';
import {
  confirmEmail,
  deleteAccount,
  login,
  logout,
  me,
  refresh,
  register,
} from './src/api/auth';
import { ApiError } from './src/api/client';
import { clearSession } from './src/session';

// the real session.ts runs here, only the keystore and the api are fake
const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockStore.delete(key);
  },
}));
jest.mock('./src/api/auth', () => ({
  register: jest.fn(),
  confirmEmail: jest.fn(),
  resendCode: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  logoutAll: jest.fn(),
  me: jest.fn(),
  deleteAccount: jest.fn(),
}));

const tokens = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 900,
};
const account = {
  user_id: 'abc',
  email: 'adam@test.com',
  email_verified: true,
  has_password: true,
  linked_providers: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(me).mockResolvedValue(account);
});

afterEach(async () => {
  // the access token stays in memory between tests otherwise
  await clearSession();
});

it('starts on login when nothing was saved', async () => {
  await render(<App />);

  expect(
    await screen.findByRole('button', { name: 'Log in' }),
  ).toBeOnTheScreen();
});

it('opens the account directly when a session was saved on a previous launch', async () => {
  mockStore.set('refresh_token', 'refresh-0');
  jest.mocked(refresh).mockResolvedValue(tokens);
  await render(<App />);

  expect(await screen.findByText('adam@test.com')).toBeOnTheScreen();
  expect(refresh).toHaveBeenCalledWith('refresh-0');
  expect(me).toHaveBeenCalledWith('access-1');
});

it('goes from register to the code, then login, the account, and back after deleting', async () => {
  jest.mocked(register).mockResolvedValue({ user_id: 'abc' });
  jest.mocked(confirmEmail).mockResolvedValue(undefined);
  jest.mocked(login).mockResolvedValue(tokens);
  jest.mocked(deleteAccount).mockResolvedValue(undefined);
  const alertMock = jest.spyOn(Alert, 'alert');
  const user = userEvent.setup();
  await render(<App />);

  await user.press(
    await screen.findByRole('button', { name: 'Create an account' }),
  );
  await user.type(screen.getByPlaceholderText('Email'), 'adam@test.com');
  await user.type(screen.getByPlaceholderText('Display name'), 'adam');
  await user.type(screen.getByPlaceholderText('Password'), 'password123');
  await user.press(screen.getByRole('button', { name: 'Create account' }));

  expect(
    await screen.findByText('We sent a 6 digit code to adam@test.com'),
  ).toBeOnTheScreen();
  await user.type(screen.getByPlaceholderText('Code'), '123456');
  await user.press(screen.getByRole('button', { name: 'Verify' }));

  expect(await screen.findByDisplayValue('adam@test.com')).toBeOnTheScreen();
  await user.type(screen.getByPlaceholderText('Password'), 'password123');
  await user.press(screen.getByRole('button', { name: 'Log in' }));

  expect(await screen.findByText('adam@test.com')).toBeOnTheScreen();
  expect(mockStore.get('refresh_token')).toBe('refresh-1');

  await user.press(screen.getByRole('button', { name: 'Delete account' }));
  const confirm = alertMock.mock.calls[0][2]?.find((b) => b.text === 'Delete');
  await act(async () => {
    confirm?.onPress?.();
  });

  expect(
    await screen.findByRole('button', { name: 'Log in' }),
  ).toBeOnTheScreen();
  expect(deleteAccount).toHaveBeenCalledWith('access-1');
  expect(mockStore.has('refresh_token')).toBe(false);
});

it('asks for the code when logging in to an account that is not verified', async () => {
  jest
    .mocked(login)
    .mockRejectedValue(
      new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Email not verified'),
    );
  const user = userEvent.setup();
  await render(<App />);

  await user.type(await screen.findByPlaceholderText('Email'), 'adam@test.com');
  await user.type(screen.getByPlaceholderText('Password'), 'password123');
  await user.press(screen.getByRole('button', { name: 'Log in' }));

  expect(
    await screen.findByText('We sent a 6 digit code to adam@test.com'),
  ).toBeOnTheScreen();
});

it('logs out and goes back to login', async () => {
  mockStore.set('refresh_token', 'refresh-0');
  jest.mocked(refresh).mockResolvedValue(tokens);
  jest.mocked(logout).mockResolvedValue(undefined);
  const user = userEvent.setup();
  await render(<App />);

  await screen.findByText('adam@test.com');
  await user.press(screen.getByRole('button', { name: 'Log out' }));

  expect(
    await screen.findByRole('button', { name: 'Log in' }),
  ).toBeOnTheScreen();
  expect(logout).toHaveBeenCalledWith('refresh-1');
  expect(mockStore.has('refresh_token')).toBe(false);
});
