import {
  render,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import VerifyEmailScreen from './VerifyEmailScreen';
import { confirmEmail, resendCode } from '../api/auth';
import { ApiError } from '../api/client';

jest.mock('../api/auth', () => ({
  confirmEmail: jest.fn(),
  resendCode: jest.fn(),
}));

const confirmMock = jest.mocked(confirmEmail);
const resendMock = jest.mocked(resendCode);

beforeEach(() => {
  confirmMock.mockReset();
  resendMock.mockReset();
});

async function typeCode(code = '123456') {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText('Code'), code);
  return user;
}

it('says where the code was sent', async () => {
  await render(
    <VerifyEmailScreen email="adam@test.com" onVerified={jest.fn()} />,
  );

  expect(
    screen.getByText('We sent a 6 digit code to adam@test.com'),
  ).toBeOnTheScreen();
});

it('confirms the code and tells the parent', async () => {
  confirmMock.mockResolvedValue(undefined);
  const onVerified = jest.fn();
  await render(
    <VerifyEmailScreen email="adam@test.com" onVerified={onVerified} />,
  );

  const user = await typeCode();
  await user.press(screen.getByRole('button', { name: 'Verify' }));

  expect(confirmMock).toHaveBeenCalledWith('adam@test.com', '123456');
  await waitFor(() => expect(onVerified).toHaveBeenCalled());
});

it.each([
  ['TOKEN_INVALID', 'That code is not right.'],
  ['TOKEN_EXPIRED', 'That code expired, send a new one.'],
  ['TOKEN_ATTEMPTS_EXCEEDED', 'Too many wrong tries, send a new code.'],
])('explains %s in plain words', async (code, text) => {
  confirmMock.mockRejectedValue(new ApiError(400, code, 'from the server'));
  const onVerified = jest.fn();
  await render(
    <VerifyEmailScreen email="adam@test.com" onVerified={onVerified} />,
  );

  const user = await typeCode();
  await user.press(screen.getByRole('button', { name: 'Verify' }));

  expect(await screen.findByText(text)).toBeOnTheScreen();
  expect(onVerified).not.toHaveBeenCalled();
});

it('shows the message from the server for other api errors', async () => {
  confirmMock.mockRejectedValue(
    new ApiError(400, 'VALIDATION_ERROR', 'token must be 6 digits'),
  );
  await render(
    <VerifyEmailScreen email="adam@test.com" onVerified={jest.fn()} />,
  );

  const user = await typeCode('12');
  await user.press(screen.getByRole('button', { name: 'Verify' }));

  expect(await screen.findByText('token must be 6 digits')).toBeOnTheScreen();
});

it('blocks a second tap while the code is being checked', async () => {
  // a second tap would burn one of the 5 tries on the same code
  confirmMock.mockReturnValue(new Promise(() => {}));
  await render(
    <VerifyEmailScreen email="adam@test.com" onVerified={jest.fn()} />,
  );

  const user = await typeCode();
  await user.press(screen.getByRole('button', { name: 'Verify' }));

  const button = screen.getByRole('button', { name: 'Checking...' });
  expect(button).toBeDisabled();
  await user.press(button);
  expect(confirmMock).toHaveBeenCalledTimes(1);
});

it('sends a new code and says so', async () => {
  resendMock.mockResolvedValue(undefined);
  const user = userEvent.setup();
  await render(
    <VerifyEmailScreen email="adam@test.com" onVerified={jest.fn()} />,
  );

  await user.press(screen.getByRole('button', { name: 'Send a new code' }));

  expect(resendMock).toHaveBeenCalledWith('adam@test.com');
  expect(await screen.findByText('We sent you a new code.')).toBeOnTheScreen();
});

it('shows the error when sending a new code fails', async () => {
  resendMock.mockRejectedValue(
    new ApiError(500, 'INTERNAL_ERROR', 'Internal server error'),
  );
  const user = userEvent.setup();
  await render(
    <VerifyEmailScreen email="adam@test.com" onVerified={jest.fn()} />,
  );

  await user.press(screen.getByRole('button', { name: 'Send a new code' }));

  expect(await screen.findByText('Internal server error')).toBeOnTheScreen();
  expect(screen.queryByText('We sent you a new code.')).not.toBeOnTheScreen();
});
