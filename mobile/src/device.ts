import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';

const DEVICE_ID_KEY = 'device_id';

let deviceId: Promise<string> | undefined;

async function loadOrCreateDeviceId(): Promise<string> {
  const saved = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (saved) return saved;

  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

// made once on the first launch and kept forever, it's how the backend
// recognises this phone. everyone shares the same promise so two requests
// at startup can't each create a different id
export function getDeviceId(): Promise<string> {
  if (!deviceId) {
    deviceId = loadOrCreateDeviceId().catch((err) => {
      deviceId = undefined; // so the next call tries again
      throw err;
    });
  }
  return deviceId;
}

// HeadersGuard on the backend answers 400 MISSING_CLIENT_HEADERS without these
export async function getDeviceHeaders(): Promise<Record<string, string>> {
  return {
    'X-Platform': Platform.OS,
    'X-Device-Model': Device.modelName ?? 'unknown',
    'X-App-Version': Constants.expoConfig?.version ?? '0.0.0',
    'X-Device-Id': await getDeviceId(),
  };
}
