import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Screen,
  Heading,
  Field,
  Action,
  Notice,
  SwitchAction,
  ui,
} from '../ui/Design';
import { register } from '../api/auth';
import { ApiError } from '../api/client';

type Props = {
  // gets the email so the next screen knows where the code was sent
  onRegistered: (email: string) => void;
  onLogin: () => void;
};

export default function RegisterScreen({ onRegistered, onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      await register({
        email,
        password,
        display_name: displayName,
      });
      onRegistered(email);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Heading title="Create an account" subtitle="Sign up for Music Room." />
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
          label="Display name"
          placeholder="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          autoComplete="nickname"
        />
        <Field
          label="Password"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoComplete="new-password"
          secureTextEntry
        />
        <Text style={ui.helper}>Use at least 8 characters.</Text>
        {error ? <Notice>{error}</Notice> : null}
        <Action
          title={loading ? 'Creating account...' : 'Create account'}
          onPress={handleSubmit}
          disabled={loading}
          loading={loading}
        />
      </View>
      <SwitchAction
        prompt="Already have an account?"
        title="Log in"
        accessibilityLabel="I already have an account"
        onPress={onLogin}
      />
    </Screen>
  );
}

// look at the code, not the message: the backend can reword its messages anytime
function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
    return 'This email already has an account.';
  }
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong, try again.';
}
