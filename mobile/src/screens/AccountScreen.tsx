import { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';
import { deleteAccount, logoutAll, me, type Me } from '../api/auth';
import { ApiError } from '../api/client';
import { clearSession, logOut, withAccessToken } from '../session';

type Props = {
  onLoggedOut: () => void;
};

type Action = 'logout' | 'logout-all' | 'delete';

export default function AccountScreen({ onLoggedOut }: Props) {
  const [account, setAccount] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Action | null>(null);

  // the refresh token was refused (expired, revoked from another phone...),
  // nothing to do here anymore but log in again
  function handleError(err: unknown) {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') {
      onLoggedOut();
      return;
    }
    setError(
      err instanceof ApiError
        ? err.message
        : 'Something went wrong, try again.',
    );
  }

  async function loadAccount() {
    setError('');
    try {
      setAccount(await withAccessToken(me));
    } catch (err) {
      handleError(err);
    }
  }

  // once, when the screen opens
  useEffect(() => {
    loadAccount();
  }, []);

  async function run(action: Action, work: () => Promise<void>) {
    setError('');
    setBusy(action);
    try {
      await work();
      onLoggedOut();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(null);
    }
  }

  function handleLogout() {
    run('logout', logOut);
  }

  // if this fails the other phones are still logged in, so this one stays
  // logged in too and the user can try again
  function handleLogoutAll() {
    run('logout-all', async () => {
      await withAccessToken(logoutAll);
      await clearSession();
    });
  }

  function confirmDelete() {
    Alert.alert('Delete account', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          run('delete', async () => {
            await withAccessToken(deleteAccount);
            await clearSession();
          }),
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your account</Text>

      {account ? (
        <Text style={styles.email}>{account.email}</Text>
      ) : error ? null : (
        <Text style={styles.label}>Loading...</Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {error && !account ? (
        <Button title="Try again" onPress={loadAccount} />
      ) : null}

      <Button
        title={busy === 'logout' ? 'Logging out...' : 'Log out'}
        onPress={handleLogout}
        disabled={busy !== null}
      />
      <Button
        title={busy === 'logout-all' ? 'Logging out...' : 'Log out everywhere'}
        onPress={handleLogoutAll}
        disabled={busy !== null}
      />
      <Button
        title={busy === 'delete' ? 'Deleting...' : 'Delete account'}
        color="#d32f2f"
        onPress={confirmDelete}
        disabled={busy !== null}
      />
    </View>
  );
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
  label: {
    color: '#666',
  },
  email: {
    marginBottom: 12,
  },
  error: {
    color: '#d32f2f',
  },
});
