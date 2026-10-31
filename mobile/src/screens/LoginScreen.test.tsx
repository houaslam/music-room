import {
  render,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import LoginScreen from './LoginScreen';
import { login } from '../api/auth';
import { ApiError } from '../api/client';
import { startSession } from '../session';

jest.mock('../api/auth', () => ({ login: jest.fn() }));
jest.mock('../session', () => ({ startSession: jest.fn() }));

const loginMock = jest.mocked(login);
const startSessionMock = jest.mocked(startSession);

const tokens = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 900,
};

beforeEach(() => {
  loginMock.mockReset();
  startSessionMock.mockReset();
  startSessionMock.mockResolvedValue(undefined);
});

function renderLogin(props: Partial<Parameters<typeof LoginScreen>[0]> = {}) {
  return render(
    <LoginScreen
      onLoggedIn={jest.fn()}
      onNeedsVerification={jest.fn()}
      onRegister={jest.fn()}
      {...props}
    />,
  );
}

async function fillForm() {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText('Email'), 'adam@test.com');
  await user.type(screen.getByPlaceholderText('Password'), 'password123');
  return user;
}

it('logs in, saves the session and tells the parent', async () => {
  loginMock.mockResolvedValue(tokens);
  const onLoggedIn = jest.fn();
  await renderLogin({ onLoggedIn });

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Log in' }));

  expect(loginMock).toHaveBeenCalledWith('adam@test.com', 'password123');
  await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
  expect(startSessionMock).toHaveBeenCalledWith(tokens);
});

it('fills in the email it was given', async () => {
  await renderLogin({ email: 'adam@test.com' });

  expect(screen.getByPlaceholderText('Email')).toHaveDisplayValue(
    'adam@test.com',
  );
});

it('says wrong email or password on INVALID_CREDENTIALS', async () => {
  loginMock.mockRejectedValue(
    new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials!'),
  );
  const onLoggedIn = jest.fn();
  await renderLogin({ onLoggedIn });

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Log in' }));

  expect(await screen.findByText('Wrong email or password.')).toBeOnTheScreen();
  expect(onLoggedIn).not.toHaveBeenCalled();
});

it('sends an account that is not verified yet to the code screen', async () => {
  loginMock.mockRejectedValue(
    new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Email not verified'),
  );
  const onNeedsVerification = jest.fn();
  const onLoggedIn = jest.fn();
  await renderLogin({ onNeedsVerification, onLoggedIn });

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Log in' }));

  await waitFor(() =>
    expect(onNeedsVerification).toHaveBeenCalledWith('adam@test.com'),
  );
  expect(onLoggedIn).not.toHaveBeenCalled();
  expect(startSessionMock).not.toHaveBeenCalled();
});

it('says the account is locked on ACCOUNT_LOCKED', async () => {
  loginMock.mockRejectedValue(
    new ApiError(429, 'ACCOUNT_LOCKED', 'Account locked'),
  );
  await renderLogin();

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Log in' }));

  expect(
    await screen.findByText(
      'Too many wrong passwords, try again in 15 minutes.',
    ),
  ).toBeOnTheScreen();
});

it('shows the message from the server for other api errors', async () => {
  loginMock.mockRejectedValue(
    new ApiError(429, 'RATE_LIMITED', 'Too many requests, slow down'),
  );
  await renderLogin();

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Log in' }));

  expect(
    await screen.findByText('Too many requests, slow down'),
  ).toBeOnTheScreen();
});

it('shows a generic message when something unexpected breaks', async () => {
  loginMock.mockRejectedValue(new Error('boom'));
  await renderLogin();

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Log in' }));

  expect(
    await screen.findByText('Something went wrong, try again.'),
  ).toBeOnTheScreen();
});

it('blocks a second tap while logging in', async () => {
  loginMock.mockReturnValue(new Promise(() => {}));
  await renderLogin();

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Log in' }));

  const button = screen.getByRole('button', { name: 'Logging in...' });
  expect(button).toBeDisabled();
  await user.press(button);
  expect(loginMock).toHaveBeenCalledTimes(1);
});

it('goes to register', async () => {
  const onRegister = jest.fn();
  const user = userEvent.setup();
  await renderLogin({ onRegister });

  await user.press(screen.getByRole('button', { name: 'Create an account' }));

  expect(onRegister).toHaveBeenCalled();
});
