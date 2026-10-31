import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { confirmEmail, resendCode } from '../api/auth';
import { ApiError } from '../api/client';

type Props = {
  email: string;
  onVerified: () => void;
};

export default function VerifyEmailScreen({ email, onVerified }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await confirmEmail(email, code);
      onVerified();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    setInfo('');
    try {
      await resendCode(email);
      setInfo('We sent you a new code.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Check your email</Text>
      <Text>We sent a 6 digit code to {email}</Text>

      <TextInput
        style={styles.input}
        placeholder="Code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        maxLength={6}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? <Text>{info}</Text> : null}

      <Button
        title={loading ? 'Checking...' : 'Verify'}
        onPress={handleVerify}
        disabled={loading}
      />
      <Button title="Send a new code" onPress={handleResend} />
    </View>
  );
}

// look at the code, not the message: the backend can reword its messages anytime
function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'TOKEN_INVALID') return 'That code is not right.';
    if (err.code === 'TOKEN_EXPIRED')
      return 'That code expired, send a new one.';
    if (err.code === 'TOKEN_ATTEMPTS_EXCEEDED')
      return 'Too many wrong tries, send a new code.';
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
