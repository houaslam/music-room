import * as SecureStore from 'expo-secure-store';
import { logout, refresh, type Tokens } from './api/auth';
import { ApiError } from './api/client';

const REFRESH_TOKEN_KEY = 'refresh_token';

// the access token only lives 15 min so it stays in memory. the refresh token
// is what keeps us logged in after a restart, so that one goes in the keystore
let accessToken: string | null = null;
let refreshing: Promise<string> | undefined;

export async function startSession(tokens: Tokens): Promise<void> {
  accessToken = tokens.access_token;
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export async function hasSavedSession(): Promise<boolean> {
  return (await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)) !== null;
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function logOut(): Promise<void> {
  // a refresh that is still running would save a new token after we clear,
  // and the token we revoke has to be the newest one
  await refreshing?.catch(() => {});

  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  try {
    if (refreshToken) await logout(refreshToken);
  } catch {
    // logout always answers 204, so this is the network. we still log out on
    // the phone, the token just stays valid on the server until it expires
  }
  await clearSession();
}

// runs a call that needs the access token. no token yet (app just started)
// or a 401 because it ran out: get a new one with the refresh token, once
export async function withAccessToken<T>(
  call: (token: string) => Promise<T>,
): Promise<T> {
  const token = accessToken ?? (await refreshAccessToken());
  try {
    return await call(token);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    return call(await refreshAccessToken());
  }
}

// the backend rotates the refresh token on every refresh, and the old one
// coming back looks stolen so it logs out that whole session. two calls that
// need a refresh at the same time have to share it, not send it twice
function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = refreshNow().finally(() => {
      refreshing = undefined;
    });
  }
  return refreshing;
}

async function refreshNow(): Promise<string> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw sessionExpired();

  try {
    const tokens = await refresh(refreshToken);
    await startSession(tokens);
    return tokens.access_token;
  } catch (err) {
    // 401 = expired, revoked or logged out everywhere. anything else (network,
    // 500) we keep the token so the next try can still work
    if (err instanceof ApiError && err.status === 401) {
      await clearSession();
      throw sessionExpired();
    }
    throw err;
  }
}

function sessionExpired() {
  return new ApiError(
    401,
    'SESSION_EXPIRED',
    'Your session expired, log in again.',
  );
}
