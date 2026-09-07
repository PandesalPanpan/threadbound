# Threadbound

Threadbound is a separate game application for the Threaded ecosystem. It has its own repository and will eventually own its own game data. Threaded remains the authority for identity and Honey.

This first branch is deliberately only an integration spike. It proves that Threadbound can:

1. Redirect a player to Threaded.
2. Authenticate with OAuth2 Authorization Code + PKCE (S256).
3. Receive an access token without storing a client secret.
4. Read the authenticated Threaded profile.
5. Read the authoritative Honey balance.

The browser flow requests only `profile:read` and `wallet:read`. A `spendPoints` gateway method is present and contract-tested for later work, but this spike does not expose any UI or route that spends Honey.

## Architecture boundary

Game-domain code should not call Threaded endpoints directly. `src/threaded/ThreadedGateway.js` is the single integration Gateway for OAuth and the versioned Threaded API.

Threadbound must never connect directly to the Threaded database and must never treat a cached Honey balance as authoritative for purchases.

## Local end-to-end connection test

### 1. Run the Threaded integration branch

In your existing Threaded checkout:

```bash
git checkout feature/threadbound-integration-foundation
composer install
php artisan migrate
```

If Passport keys have not yet been generated for that local environment, generate them once:

```bash
php artisan passport:keys
```

Create a local public OAuth client:

```bash
php artisan threadbound:oauth-client \
  --name="Threadbound Local" \
  --redirect="http://127.0.0.1:3001/oauth/callback"
```

Copy the printed **Client ID**, then run Threaded on port 8000 (or use the URL of your already-running Threaded instance):

```bash
php artisan serve --host=127.0.0.1 --port=8000
```

The Threaded account used for the test must have a verified email because the integration API rejects unverified accounts.

### 2. Run Threadbound

```bash
git checkout spike/threaded-integration
npm install
cp .env.example .env
```

Set the generated Client ID in `.env`:

```dotenv
PORT=3001
SESSION_SECRET=use-a-long-random-local-value
THREADED_BASE_URL=http://127.0.0.1:8000
THREADED_CLIENT_ID=<client-id-from-threaded>
THREADED_REDIRECT_URI=http://127.0.0.1:3001/oauth/callback
```

Then start Threadbound:

```bash
npm start
```

Open `http://127.0.0.1:3001` and choose **Connect with Threaded**.

A successful test ends at `/connected` with JSON shaped roughly like:

```json
{
  "connected": true,
  "threaded_user": {
    "id": "42",
    "display_name": "Player",
    "avatar_url": "..."
  },
  "wallet": {
    "currency": "honey",
    "balance": 130
  }
}
```

That result proves the two independent repositories can communicate through the intended authentication and API boundary.

## Automated tests

```bash
npm test
```

The tests cover the RFC 7636 S256 challenge, OAuth request construction, public-client token exchange, bearer-authenticated profile/wallet reads, idempotent purchase request shape, and stable Threaded API error codes.

## Current limitations

This is intentionally not production-ready yet. Sessions use Express's in-memory store, there is no persistent Threadbound database, token refresh is not implemented, and no game systems exist. Those should be added only after this integration boundary is proven.

## Secrets

Never commit `.env`, OAuth access tokens, Passport keys, session secrets, or deployment secrets.
