import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AccountScreen from './src/screens/AccountScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import VerifyEmailScreen from './src/screens/VerifyEmailScreen';
import { hasSavedSession } from './src/session';

type Screen =
  | { name: 'loading' }
  | { name: 'login'; email?: string }
  | { name: 'register' }
  | { name: 'verify'; email: string }
  | { name: 'account' };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });

  useEffect(() => {
    // a refresh token saved on a previous launch means we're still logged in,
    // the account screen gets a fresh access token with it
    hasSavedSession()
      .then((saved) =>
        setScreen(saved ? { name: 'account' } : { name: 'login' }),
      )
      .catch(() => setScreen({ name: 'login' }));
  }, []);

  return (
    <View style={styles.container}>
      {screen.name === 'loading' ? (
        <ActivityIndicator style={styles.loading} />
      ) : screen.name === 'register' ? (
        <RegisterScreen
          onRegistered={(email) => setScreen({ name: 'verify', email })}
          onLogin={() => setScreen({ name: 'login' })}
        />
      ) : screen.name === 'verify' ? (
        <VerifyEmailScreen
          email={screen.email}
          onVerified={() => setScreen({ name: 'login', email: screen.email })}
        />
      ) : screen.name === 'login' ? (
        <LoginScreen
          email={screen.email}
          onLoggedIn={() => setScreen({ name: 'account' })}
          onNeedsVerification={(email) => setScreen({ name: 'verify', email })}
          onRegister={() => setScreen({ name: 'register' })}
        />
      ) : (
        <AccountScreen onLoggedOut={() => setScreen({ name: 'login' })} />
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loading: {
    flex: 1,
  },
});
