import { Alert } from 'react-native';
import {
  act,
  render,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import AccountScreen from './AccountScreen';
import { deleteAccount } from '../api/auth';
import { ApiError } from '../api/client';

jest.mock('../api/auth', () => ({ deleteAccount: jest.fn() }));

const deleteMock = jest.mocked(deleteAccount);
const alertMock = jest.spyOn(Alert, 'alert');

beforeEach(() => {
  deleteMock.mockReset();
  alertMock.mockReset();
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

it('shows the user id', async () => {
  await render(<AccountScreen userId="abc" onDeleted={jest.fn()} />);

  expect(screen.getByText('abc')).toBeOnTheScreen();
});

it('asks for confirmation before deleting anything', async () => {
  const user = userEvent.setup();
  await render(<AccountScreen userId="abc" onDeleted={jest.fn()} />);

  await user.press(screen.getByRole('button', { name: 'Delete account' }));

  expect(alertMock).toHaveBeenCalledTimes(1);
  expect(deleteMock).not.toHaveBeenCalled();
});

it('deletes the account once the user confirms', async () => {
  deleteMock.mockResolvedValue(undefined);
  const onDeleted = jest.fn();
  const user = userEvent.setup();
  await render(<AccountScreen userId="abc" onDeleted={onDeleted} />);

  await user.press(screen.getByRole('button', { name: 'Delete account' }));
  await pressAlertButton('Delete');

  expect(deleteMock).toHaveBeenCalledWith('abc');
  await waitFor(() => expect(onDeleted).toHaveBeenCalled());
});

it('stays on the screen and shows the error when the delete fails', async () => {
  deleteMock.mockRejectedValue(
    new ApiError(409, 'DATA_CONFLICT', 'User Deletion was unsuccessfull'),
  );
  const onDeleted = jest.fn();
  const user = userEvent.setup();
  await render(<AccountScreen userId="abc" onDeleted={onDeleted} />);

  await user.press(screen.getByRole('button', { name: 'Delete account' }));
  await pressAlertButton('Delete');

  expect(
    await screen.findByText('User Deletion was unsuccessfull'),
  ).toBeOnTheScreen();
  expect(onDeleted).not.toHaveBeenCalled();
});

it('shows a generic message when something unexpected breaks', async () => {
  deleteMock.mockRejectedValue(new Error('boom'));
  const user = userEvent.setup();
  await render(<AccountScreen userId="abc" onDeleted={jest.fn()} />);

  await user.press(screen.getByRole('button', { name: 'Delete account' }));
  await pressAlertButton('Delete');

  expect(
    await screen.findByText('Something went wrong, try again.'),
  ).toBeOnTheScreen();
});
