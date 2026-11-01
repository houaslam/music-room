import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
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
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="current-password"
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        title={loading ? 'Logging in...' : 'Log in'}
        onPress={handleSubmit}
        disabled={loading}
      />
      <Button title="Create an account" onPress={onRegister} />
    </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 96,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  error: {
    color: '#d32f2f',
  },
});
