import { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen, Heading, Field, Action, Notice, ui } from '../ui/Design';
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
    <Screen artwork>
      <Heading
        title="Verify your email"
        subtitle={`We sent a 6 digit code to ${email}`}
      />
      <View style={ui.form}>
        <Field
          label="Your verification code"
          placeholder="Code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          style={{ fontSize: 25, letterSpacing: 9, textAlign: 'center' }}
        />
        <Text style={ui.helper}>Enter the code to verify your email.</Text>
        {error ? <Notice>{error}</Notice> : null}
        {info ? <Notice success>{info}</Notice> : null}
        <Action
          title={loading ? 'Checking...' : 'Verify'}
          onPress={handleVerify}
          disabled={loading}
          loading={loading}
        />
        <Action title="Send a new code" onPress={handleResend} secondary />
      </View>
    </Screen>
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
