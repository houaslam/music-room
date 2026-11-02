import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Screen, Heading, Action, Notice, ui } from '../ui/Design';
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
    <Screen>
      <Heading
        title="Your account"
        subtitle="Manage your Music Room account and sessions."
      />
      <View style={ui.card}>
        <View style={ui.avatar}>
          <Text style={ui.avatarText}>
            {account ? account.email.charAt(0).toUpperCase() : '♪'}
          </Text>
        </View>
        <Text style={ui.section}>YOUR ACCOUNT</Text>
        {account ? (
          <>
            <Text style={ui.email}>{account.email}</Text>
            <Text style={ui.badge}>
              {account.email_verified
                ? '✓  EMAIL VERIFIED'
                : '○  EMAIL NOT VERIFIED'}
            </Text>
          </>
        ) : error ? null : (
          <Text style={ui.helper}>Loading...</Text>
        )}
      </View>
      <View style={ui.form}>
        {error ? <Notice>{error}</Notice> : null}
        {error && !account ? (
          <Action title="Try again" onPress={loadAccount} />
        ) : null}
        <Text style={ui.section}>SESSION & SECURITY</Text>
        <Action
          title={busy === 'logout' ? 'Logging out...' : 'Log out'}
          onPress={handleLogout}
          disabled={busy !== null}
          loading={busy === 'logout'}
        />
        <Action
          title={
            busy === 'logout-all' ? 'Logging out...' : 'Log out everywhere'
          }
          onPress={handleLogoutAll}
          disabled={busy !== null}
          loading={busy === 'logout-all'}
          secondary
        />
        <Text style={ui.helper}>
          Logging out everywhere ends your sessions on all devices.
        </Text>
        <Action
          title={busy === 'delete' ? 'Deleting...' : 'Delete account'}
          onPress={confirmDelete}
          disabled={busy !== null}
          loading={busy === 'delete'}
          destructive
        />
      </View>
    </Screen>
  );
}
