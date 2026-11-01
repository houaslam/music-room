# Music Room - mobile app

Expo (React Native + TypeScript) app for the Music Room API in the repo root.

For now it covers what the backend has: register, verify the email with the 6 digit code,
log in, see your account, log out (this phone or everywhere) and delete the account.
You stay logged in after closing the app.

## Run it

1. start the backend from the repo root: `npm run start:dev` (port 3000)
2. in this folder:

```bash
npm install
cp .env.example .env   # then set the right url in it, see the comments inside
npx expo start
```

3. open it with Expo Go on your phone (scan the QR code), or press `a` for the android emulator

If a real phone can't reach the backend, check that both are on the same wifi and that the
firewall lets port 3000 through.

## Tests

```bash
npm test
npm run typecheck
```

Tests are next to the files they test (`*.test.ts(x)`). They mock `fetch` and the expo modules,
so the backend doesn't need to be running.

## Where things are

- `App.tsx` - picks the screen: login, register, code, or account if a session was saved
- `src/device.ts` - the 4 `X-*` headers the backend wants on every request
- `src/api/client.ts` - `request()`: base url, headers, bearer token, timeout, turns errors into `ApiError`
- `src/api/auth.ts` - one function per `/auth` route
- `src/session.ts` - the tokens. refresh token in the keystore, access token in memory,
  `withAccessToken()` gets a new one when it runs out. only one refresh at a time, the backend
  logs the whole session out if the same refresh token comes back twice
- `src/screens/` - the screens
