import { Alert } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import App from './App';
import { deleteAccount, register } from './src/api/auth';

jest.mock('./src/api/auth', () => ({
  register: jest.fn(),
  deleteAccount: jest.fn(),
}));

it('goes from register to the account screen and back after deleting', async () => {
  jest.mocked(register).mockResolvedValue({ user_id: 'abc' });
  jest.mocked(deleteAccount).mockResolvedValue(undefined);
  const alertMock = jest.spyOn(Alert, 'alert');
  const user = userEvent.setup();
  await render(<App />);

  await user.type(screen.getByPlaceholderText('Email'), 'adam@test.com');
  await user.type(screen.getByPlaceholderText('Display name'), 'adam');
  await user.type(screen.getByPlaceholderText('Password'), 'password123');
  await user.press(screen.getByRole('button', { name: 'Create account' }));

  expect(await screen.findByText('abc')).toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Delete account' }));
  const confirm = alertMock.mock.calls[0][2]?.find((b) => b.text === 'Delete');
  await act(async () => {
    confirm?.onPress?.();
  });

  expect(
    await screen.findByRole('button', { name: 'Create account' }),
  ).toBeOnTheScreen();
});
