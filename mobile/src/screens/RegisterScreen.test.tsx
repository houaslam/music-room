import {
  render,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import RegisterScreen from './RegisterScreen';
import { register } from '../api/auth';
import { ApiError } from '../api/client';

jest.mock('../api/auth', () => ({ register: jest.fn() }));

const registerMock = jest.mocked(register);

beforeEach(() => {
  registerMock.mockReset();
});

async function fillForm() {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText('Email'), 'adam@test.com');
  await user.type(screen.getByPlaceholderText('Display name'), 'adam');
  await user.type(screen.getByPlaceholderText('Password'), 'password123');
  return user;
}

it('registers and gives the new user id to the parent', async () => {
  registerMock.mockResolvedValue({ user_id: 'abc' });
  const onRegistered = jest.fn();
  await render(<RegisterScreen onRegistered={onRegistered} />);

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Create account' }));

  expect(registerMock).toHaveBeenCalledWith({
    email: 'adam@test.com',
    display_name: 'adam',
    password: 'password123',
  });
  await waitFor(() => expect(onRegistered).toHaveBeenCalledWith('abc'));
});

it('says so when the email already has an account', async () => {
  registerMock.mockRejectedValue(
    new ApiError(409, 'EMAIL_TAKEN', 'Email is already taken!'),
  );
  await render(<RegisterScreen onRegistered={jest.fn()} />);

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Create account' }));

  expect(
    await screen.findByText('This email already has an account.'),
  ).toBeOnTheScreen();
});

it('shows the message from the server for other api errors', async () => {
  registerMock.mockRejectedValue(
    new ApiError(
      400,
      'VALIDATION_ERROR',
      'password must be longer than or equal to 8 characters',
    ),
  );
  await render(<RegisterScreen onRegistered={jest.fn()} />);

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Create account' }));

  expect(
    await screen.findByText(
      'password must be longer than or equal to 8 characters',
    ),
  ).toBeOnTheScreen();
});

it('shows a generic message when something unexpected breaks', async () => {
  registerMock.mockRejectedValue(new Error('boom'));
  await render(<RegisterScreen onRegistered={jest.fn()} />);

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Create account' }));

  expect(
    await screen.findByText('Something went wrong, try again.'),
  ).toBeOnTheScreen();
});

it('blocks a second tap while the first request is still running', async () => {
  // never resolves, so the screen stays in its loading state
  registerMock.mockReturnValue(new Promise(() => {}));
  await render(<RegisterScreen onRegistered={jest.fn()} />);

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Create account' }));

  const button = screen.getByRole('button', { name: 'Creating account...' });
  expect(button).toBeDisabled();
  await user.press(button);
  expect(registerMock).toHaveBeenCalledTimes(1);
});

it('clears the old error when trying again', async () => {
  registerMock
    .mockRejectedValueOnce(
      new ApiError(409, 'EMAIL_TAKEN', 'Email is already taken!'),
    )
    .mockResolvedValueOnce({ user_id: 'abc' });
  await render(<RegisterScreen onRegistered={jest.fn()} />);

  const user = await fillForm();
  await user.press(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByText('This email already has an account.');
  await user.press(screen.getByRole('button', { name: 'Create account' }));

  await waitFor(() =>
    expect(
      screen.queryByText('This email already has an account.'),
    ).not.toBeOnTheScreen(),
  );
});
