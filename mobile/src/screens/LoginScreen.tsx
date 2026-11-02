import { useState } from 'react';
import { View } from 'react-native';
import {
  Screen,
  Heading,
  Field,
  Action,
  Notice,
  SwitchAction,
  ui,
} from '../ui/Design';
import { login } from '../api/auth';
import { ApiError } from '../api/client';
import { startSession } from '../session';

type Props = {
  // filled in when we come from the code screen
  email?: string;
  onLoggedIn: () => void;
  onNeedsVerification: (email: string) => void;
  onRegister: () => void;
};

export default function LoginScreen({
  email: initialEmail = '',
  onLoggedIn,
  onNeedsVerification,
  onRegister,
}: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      await startSession(await login(email, password));
      onLoggedIn();
    } catch (err) {
      // the backend only says this once the password is right
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        onNeedsVerification(email);
        return;
      }
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen artwork>
      <Heading title="Log in" subtitle="Log in to your Music Room account." />
      <View style={ui.form}>
        <Field
          label="Email address"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <Field
          label="Password"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoComplete="current-password"
          secureTextEntry
        />
        {error ? <Notice>{error}</Notice> : null}
        <Action
          title={loading ? 'Logging in...' : 'Log in'}
          onPress={handleSubmit}
          disabled={loading}
          loading={loading}
        />
      </View>
      <SwitchAction
        prompt="New to Music Room?"
        title="Create an account"
        accessibilityLabel="Create an account"
        onPress={onRegister}
      />
    </Screen>
  );
}

// look at the code, not the message: the backend can reword its messages anytime
function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_CREDENTIALS') return 'Wrong email or password.';
    if (err.code === 'ACCOUNT_LOCKED')
      return 'Too many wrong passwords, try again in 15 minutes.';
    return err.message;
  }
  return 'Something went wrong, try again.';
}
