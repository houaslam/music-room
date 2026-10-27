import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { register } from '../api/auth';
import { ApiError } from '../api/client';

type Props = {
  onRegistered: (userId: string) => void;
};

export default function RegisterScreen({ onRegistered }: Props) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      const { user_id } = await register({
        email,
        password,
        display_name: displayName,
      });
      onRegistered(user_id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your account</Text>

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
        placeholder="Display name"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="new-password"
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        title={loading ? 'Creating account...' : 'Create account'}
        onPress={handleSubmit}
        disabled={loading}
      />
    </View>
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
