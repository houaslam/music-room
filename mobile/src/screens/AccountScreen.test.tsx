import { Alert } from 'react-native';
import {
  act,
  render,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import AccountScreen from './AccountScreen';
import { deleteAccount, logoutAll, me } from '../api/auth';
import { ApiError } from '../api/client';
import { clearSession, logOut, withAccessToken } from '../session';

jest.mock('../api/auth', () => ({
  me: jest.fn(),
  logoutAll: jest.fn(),
  deleteAccount: jest.fn(),
}));
jest.mock('../session', () => ({
  withAccessToken: jest.fn(),
  logOut: jest.fn(),
  clearSession: jest.fn(),
}));

const meMock = jest.mocked(me);
const logoutAllMock = jest.mocked(logoutAll);
const deleteMock = jest.mocked(deleteAccount);
const withAccessTokenMock = jest.mocked(withAccessToken);
const logOutMock = jest.mocked(logOut);
const clearSessionMock = jest.mocked(clearSession);
const alertMock = jest.spyOn(Alert, 'alert');

const account = {
  user_id: 'abc',
  email: 'adam@test.com',
  email_verified: true,
  has_password: true,
  linked_providers: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  alertMock.mockReset();
  // the real one refreshes the token when needed, here it just hands one over
  withAccessTokenMock.mockImplementation((call) => call('access-1'));
  meMock.mockResolvedValue(account);
  logOutMock.mockResolvedValue(undefined);
  clearSessionMock.mockResolvedValue(undefined);
});

// Alert.alert opens a native dialog, so in tests we take the button
// the screen gave to Alert and press it ourselves
async function pressAlertButton(text: string) {
  const buttons = alertMock.mock.calls[0][2] ?? [];
  const button = buttons.find((b) => b.text === text);
  await act(async () => {
    button?.onPress?.();
  });
}

it('shows the email of the logged in user', async () => {
  await render(<AccountScreen onLoggedOut={jest.fn()} />);

  expect(await screen.findByText('adam@test.com')).toBeOnTheScreen();
  expect(meMock).toHaveBeenCalledWith('access-1');
});

it('goes back to login when the session expired', async () => {
  withAccessTokenMock.mockRejectedValue(
    new ApiError(401, 'SESSION_EXPIRED', 'Your session expired, log in again.'),
  );
  const onLoggedOut = jest.fn();
  await render(<AccountScreen onLoggedOut={onLoggedOut} />);

  await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
});

it('shows the error and lets you try again when loading fails', async () => {
  meMock
    .mockRejectedValueOnce(
      new ApiError(
        0,
        'NETWORK_ERROR',
        "Can't reach the server, check your connection.",
      ),
    )
    .mockResolvedValueOnce(account);
  const user = userEvent.setup();
  await render(<AccountScreen onLoggedOut={jest.fn()} />);

  expect(
    await screen.findByText("Can't reach the server, check your connection."),
  ).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('adam@test.com')).toBeOnTheScreen();
  expect(
    screen.queryByText("Can't reach the server, check your connection."),
  ).not.toBeOnTheScreen();
});

it('logs out', async () => {
  const onLoggedOut = jest.fn();
  const user = userEvent.setup();
  await render(<AccountScreen onLoggedOut={onLoggedOut} />);
  await screen.findByText('adam@test.com');

  await user.press(screen.getByRole('button', { name: 'Log out' }));

  expect(logOutMock).toHaveBeenCalled();
  await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
});

it('logs out on every device', async () => {
  logoutAllMock.mockResolvedValue(undefined);
  const onLoggedOut = jest.fn();
  const user = userEvent.setup();
  await render(<AccountScreen onLoggedOut={onLoggedOut} />);
  await screen.findByText('adam@test.com');

  await user.press(screen.getByRole('button', { name: 'Log out everywhere' }));

  expect(logoutAllMock).toHaveBeenCalledWith('access-1');
  await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
  expect(clearSessionMock).toHaveBeenCalled();
});

it('stays logged in and shows the error when log out everywhere fails', async () => {
  // the other devices are still logged in, so keep this one too and let them retry
  logoutAllMock.mockRejectedValue(
    new ApiError(
      0,
      'NETWORK_ERROR',
      "Can't reach the server, check your connection.",
    ),
  );
  const onLoggedOut = jest.fn();
  const user = userEvent.setup();
  await render(<AccountScreen onLoggedOut={onLoggedOut} />);
  await screen.findByText('adam@test.com');

  await user.press(screen.getByRole('button', { name: 'Log out everywhere' }));

  expect(
    await screen.findByText("Can't reach the server, check your connection."),
  ).toBeOnTheScreen();
  expect(clearSessionMock).not.toHaveBeenCalled();
  expect(onLoggedOut).not.toHaveBeenCalled();
});

it('asks for confirmation before deleting anything', async () => {
  const user = userEvent.setup();
  await render(<AccountScreen onLoggedOut={jest.fn()} />);
  await screen.findByText('adam@test.com');

  await user.press(screen.getByRole('button', { name: 'Delete account' }));

  expect(alertMock).toHaveBeenCalledTimes(1);
  expect(deleteMock).not.toHaveBeenCalled();
});

it('deletes the account once the user confirms', async () => {
  deleteMock.mockResolvedValue(undefined);
  const onLoggedOut = jest.fn();
  const user = userEvent.setup();
  await render(<AccountScreen onLoggedOut={onLoggedOut} />);
  await screen.findByText('adam@test.com');

  await user.press(screen.getByRole('button', { name: 'Delete account' }));
  await pressAlertButton('Delete');

  expect(deleteMock).toHaveBeenCalledWith('access-1');
  await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
  expect(clearSessionMock).toHaveBeenCalled();
});

it('stays on the screen and shows the error when the delete fails', async () => {
  deleteMock.mockRejectedValue(
    new ApiError(409, 'DATA_CONFLICT', 'User Deletion was unsuccessfull'),
  );
  const onLoggedOut = jest.fn();
  const user = userEvent.setup();
  await render(<AccountScreen onLoggedOut={onLoggedOut} />);
  await screen.findByText('adam@test.com');

  await user.press(screen.getByRole('button', { name: 'Delete account' }));
  await pressAlertButton('Delete');

  expect(
    await screen.findByText('User Deletion was unsuccessfull'),
  ).toBeOnTheScreen();
  expect(onLoggedOut).not.toHaveBeenCalled();
  expect(clearSessionMock).not.toHaveBeenCalled();
});

it('goes back to login when the session expired during an action', async () => {
  const onLoggedOut = jest.fn();
  const user = userEvent.setup();
  await render(<AccountScreen onLoggedOut={onLoggedOut} />);
  await screen.findByText('adam@test.com');
  withAccessTokenMock.mockRejectedValue(
    new ApiError(401, 'SESSION_EXPIRED', 'Your session expired, log in again.'),
  );

  await user.press(screen.getByRole('button', { name: 'Delete account' }));
  await pressAlertButton('Delete');

  await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
});

it('shows a generic message when something unexpected breaks', async () => {
  deleteMock.mockRejectedValue(new Error('boom'));
  const user = userEvent.setup();
  await render(<AccountScreen onLoggedOut={jest.fn()} />);
  await screen.findByText('adam@test.com');

  await user.press(screen.getByRole('button', { name: 'Delete account' }));
  await pressAlertButton('Delete');

  expect(
    await screen.findByText('Something went wrong, try again.'),
  ).toBeOnTheScreen();
});
