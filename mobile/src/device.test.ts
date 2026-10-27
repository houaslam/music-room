import { Platform } from 'react-native';

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockRandomUUID = jest.fn();
const mockDevice = { __esModule: true, modelName: 'Pixel 7' as string | null };

jest.mock('expo-secure-store', () => ({
  getItemAsync: mockGetItem,
  setItemAsync: mockSetItem,
}));
jest.mock('expo-crypto', () => ({ randomUUID: mockRandomUUID }));
jest.mock('expo-device', () => mockDevice);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' } },
}));

// device.ts keeps the id in memory after the first call,
// so every test loads a fresh copy of the file
function loadDevice(): typeof import('./device') {
  jest.resetModules();
  return require('./device');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetItem.mockResolvedValue(undefined);
  mockDevice.modelName = 'Pixel 7';
});

describe('getDeviceId', () => {
  it('creates an id on first launch and saves it', async () => {
    mockGetItem.mockResolvedValue(null);
    mockRandomUUID.mockReturnValue('new-id');
    const { getDeviceId } = loadDevice();

    await expect(getDeviceId()).resolves.toBe('new-id');
    expect(mockSetItem).toHaveBeenCalledWith('device_id', 'new-id');
  });

  it('reuses the id saved on a previous launch', async () => {
    mockGetItem.mockResolvedValue('saved-id');
    const { getDeviceId } = loadDevice();

    await expect(getDeviceId()).resolves.toBe('saved-id');
    expect(mockRandomUUID).not.toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('creates only one id when two requests ask for it at the same time', async () => {
    mockGetItem.mockResolvedValue(null);
    mockRandomUUID.mockReturnValueOnce('first').mockReturnValueOnce('second');
    const { getDeviceId } = loadDevice();

    const ids = await Promise.all([getDeviceId(), getDeviceId()]);

    expect(ids).toEqual(['first', 'first']);
    expect(mockSetItem).toHaveBeenCalledTimes(1);
  });

  it('tries again on the next call if the secure store failed', async () => {
    mockGetItem
      .mockRejectedValueOnce(new Error('keystore error'))
      .mockResolvedValue('saved-id');
    const { getDeviceId } = loadDevice();

    await expect(getDeviceId()).rejects.toThrow('keystore error');
    await expect(getDeviceId()).resolves.toBe('saved-id');
  });
});

describe('getDeviceHeaders', () => {
  it('returns the 4 headers the backend checks', async () => {
    mockGetItem.mockResolvedValue('saved-id');
    const { getDeviceHeaders } = loadDevice();

    await expect(getDeviceHeaders()).resolves.toEqual({
      'X-Platform': Platform.OS,
      'X-Device-Model': 'Pixel 7',
      'X-App-Version': '1.0.0',
      'X-Device-Id': 'saved-id',
    });
  });

  it('sends "unknown" when the phone does not give a model name', async () => {
    mockGetItem.mockResolvedValue('saved-id');
    mockDevice.modelName = null;
    const { getDeviceHeaders } = loadDevice();

    const headers = await getDeviceHeaders();

    expect(headers['X-Device-Model']).toBe('unknown');
  });
});
