# Music Room - mobile app

Expo (React Native + TypeScript) app for the Music Room API in the repo root.

For now it covers what the backend has: register, and delete the account you just made.

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

- `App.tsx` - shows the register screen, or the account screen once we have a user id
- `src/device.ts` - the 4 `X-*` headers the backend wants on every request
- `src/api/client.ts` - `request()`: base url, headers, timeout, turns errors into `ApiError`
- `src/api/auth.ts` - one function per `/auth` route
- `src/screens/` - the screens
