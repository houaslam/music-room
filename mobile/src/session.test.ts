const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockDeleteItem = jest.fn();
const mockRefresh = jest.fn();
const mockLogout = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: mockGetItem,
  setItemAsync: mockSetItem,
  deleteItemAsync: mockDeleteItem,
}));
jest.mock('./api/auth', () => ({ refresh: mockRefresh, logout: mockLogout }));

const tokens = (n: number) => ({
  access_token: `access-${n}`,
  refresh_token: `refresh-${n}`,
  expires_in: 900,
});

// session.ts keeps the access token in memory, so every test loads a fresh
// copy of the file. ApiError comes from the same copy or instanceof breaks
function loadSession() {
  jest.resetModules();
  const session: typeof import('./session') = require('./session');
  const { ApiError }: typeof import('./api/client') = require('./api/client');
  return { ...session, ApiError };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetItem.mockResolvedValue(undefined);
  mockDeleteItem.mockResolvedValue(undefined);
  mockGetItem.mockResolvedValue(null);
});

describe('startSession', () => {
  it('keeps the refresh token in the secure store and uses the access token right away', async () => {
    const { startSession, withAccessToken } = loadSession();
    const call = jest.fn().mockResolvedValue('ok');

    await startSession(tokens(1));
    await withAccessToken(call);

    expect(mockSetItem).toHaveBeenCalledWith('refresh_token', 'refresh-1');
    expect(call).toHaveBeenCalledWith('access-1');
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe('hasSavedSession', () => {
  it('is true when a refresh token was saved on a previous launch', async () => {
    mockGetItem.mockResolvedValue('refresh-0');
    const { hasSavedSession } = loadSession();

    await expect(hasSavedSession()).resolves.toBe(true);
    expect(mockGetItem).toHaveBeenCalledWith('refresh_token');
  });

  it('is false when nothing was saved', async () => {
    const { hasSavedSession } = loadSession();

    await expect(hasSavedSession()).resolves.toBe(false);
  });
});

describe('withAccessToken', () => {
  it('gets an access token with the saved refresh token after a restart', async () => {
    mockGetItem.mockResolvedValue('refresh-0');
    mockRefresh.mockResolvedValue(tokens(1));
    const { withAccessToken } = loadSession();
    const call = jest.fn().mockResolvedValue('ok');

    await expect(withAccessToken(call)).resolves.toBe('ok');

    expect(mockRefresh).toHaveBeenCalledWith('refresh-0');
    expect(mockSetItem).toHaveBeenCalledWith('refresh_token', 'refresh-1');
    expect(call).toHaveBeenCalledWith('access-1');
  });

  it('refreshes once and tries again when the access token ran out', async () => {
    const { startSession, withAccessToken, ApiError } = loadSession();
    await startSession(tokens(1));
    mockGetItem.mockResolvedValue('refresh-1');
    mockRefresh.mockResolvedValue(tokens(2));
    const call = jest
      .fn()
      .mockRejectedValueOnce(
        new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials!'),
      )
      .mockResolvedValueOnce('ok');

    await expect(withAccessToken(call)).resolves.toBe('ok');

    expect(mockRefresh).toHaveBeenCalledWith('refresh-1');
    expect(call.mock.calls).toEqual([['access-1'], ['access-2']]);
  });

  it('sends only one refresh when two calls need it at the same time', async () => {
    const { startSession, withAccessToken, ApiError } = loadSession();
    await startSession(tokens(1));
    mockGetItem.mockResolvedValue('refresh-1');
    mockRefresh.mockResolvedValue(tokens(2));
    // both calls still have the old access token and both get a 401
    const call = jest.fn((token: string) =>
      token === 'access-1'
        ? Promise.reject(
            new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials!'),
          )
        : Promise.resolve(token),
    );

    const results = await Promise.all([
      withAccessToken(call),
      withAccessToken(call),
    ]);

    expect(results).toEqual(['access-2', 'access-2']);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when the call fails for another reason', async () => {
    const { startSession, withAccessToken, ApiError } = loadSession();
    await startSession(tokens(1));
    const call = jest
      .fn()
      .mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(withAccessToken(call)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('gives up when the call still gets a 401 with the new token', async () => {
    const { startSession, withAccessToken, ApiError } = loadSession();
    await startSession(tokens(1));
    mockGetItem.mockResolvedValue('refresh-1');
    mockRefresh.mockResolvedValue(tokens(2));
    const call = jest
      .fn()
      .mockRejectedValue(
        new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials!'),
      );

    await expect(withAccessToken(call)).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(call).toHaveBeenCalledTimes(2);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('forgets the session and says SESSION_EXPIRED when the refresh token is refused', async () => {
    mockGetItem.mockResolvedValue('refresh-0');
    const { withAccessToken, ApiError } = loadSession();
    mockRefresh.mockRejectedValue(
      new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid'),
    );
    const call = jest.fn();

    await expect(withAccessToken(call)).rejects.toMatchObject({
      status: 401,
      code: 'SESSION_EXPIRED',
    });
    expect(mockDeleteItem).toHaveBeenCalledWith('refresh_token');
    expect(call).not.toHaveBeenCalled();
  });

  it('keeps the saved session when the refresh fails because of the network', async () => {
    mockGetItem.mockResolvedValue('refresh-0');
    const { withAccessToken, ApiError } = loadSession();
    mockRefresh.mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR', "Can't reach the server"),
    );

    await expect(withAccessToken(jest.fn())).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(mockDeleteItem).not.toHaveBeenCalled();
  });

  it('says SESSION_EXPIRED without calling the api when nothing is saved', async () => {
    const { withAccessToken } = loadSession();

    await expect(withAccessToken(jest.fn())).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('tries the refresh again on the next call after one failed', async () => {
    mockGetItem.mockResolvedValue('refresh-0');
    const { withAccessToken, ApiError } = loadSession();
    mockRefresh
      .mockRejectedValueOnce(
        new ApiError(0, 'NETWORK_ERROR', "Can't reach the server"),
      )
      .mockResolvedValueOnce(tokens(1));
    const call = jest.fn().mockResolvedValue('ok');

    await expect(withAccessToken(call)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    await expect(withAccessToken(call)).resolves.toBe('ok');
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });
});

describe('clearSession', () => {
  it('forgets both tokens', async () => {
    const { startSession, clearSession, withAccessToken } = loadSession();
    await startSession(tokens(1));

    await clearSession();

    expect(mockDeleteItem).toHaveBeenCalledWith('refresh_token');
    await expect(withAccessToken(jest.fn())).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
  });
});

describe('logOut', () => {
  it('revokes the refresh token on the server and forgets the session', async () => {
    const { startSession, logOut } = loadSession();
    await startSession(tokens(1));
    mockGetItem.mockResolvedValue('refresh-1');
    mockLogout.mockResolvedValue(undefined);

    await logOut();

    expect(mockLogout).toHaveBeenCalledWith('refresh-1');
    expect(mockDeleteItem).toHaveBeenCalledWith('refresh_token');
  });

  it("still logs out on the phone when the server can't be reached", async () => {
    const { startSession, logOut, ApiError } = loadSession();
    await startSession(tokens(1));
    mockGetItem.mockResolvedValue('refresh-1');
    mockLogout.mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR', "Can't reach the server"),
    );

    await expect(logOut()).resolves.toBeUndefined();
    expect(mockDeleteItem).toHaveBeenCalledWith('refresh_token');
  });

  it('waits for a refresh that is running so the new token is the one revoked', async () => {
    const saved = { token: 'refresh-0' };
    mockGetItem.mockImplementation(async () => saved.token);
    mockSetItem.mockImplementation(async (_key: string, value: string) => {
      saved.token = value;
    });
    let finishRefresh!: (value: ReturnType<typeof tokens>) => void;
    mockRefresh.mockReturnValue(
      new Promise((resolve) => {
        finishRefresh = resolve;
      }),
    );
    mockLogout.mockResolvedValue(undefined);
    const { withAccessToken, logOut } = loadSession();

    const pending = withAccessToken(jest.fn().mockResolvedValue('ok'));
    const loggingOut = logOut();
    finishRefresh(tokens(1));
    await pending;
    await loggingOut;

    expect(mockLogout).toHaveBeenCalledWith('refresh-1');
    expect(mockDeleteItem).toHaveBeenCalledWith('refresh_token');
  });
});
