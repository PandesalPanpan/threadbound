import express from 'express';
import session from 'express-session';
import { config } from './config.js';
import { createCodeChallenge, createCodeVerifier, createOAuthState } from './oauth/pkce.js';
import { ThreadedApiError, ThreadedGateway } from './threaded/ThreadedGateway.js';

const app = express();
const threaded = new ThreadedGateway(config.threaded);

app.disable('x-powered-by');
app.use(
  session({
    name: 'threadbound.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 60 * 60 * 1000,
    },
  }),
);

app.get('/health', (_request, response) => {
  response.json({ status: 'ok', service: 'threadbound' });
});

app.get('/', (request, response) => {
  if (request.session.threaded) {
    return response.type('html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Threadbound integration spike</title></head>
  <body>
    <h1>Threadbound ↔ Threaded</h1>
    <p>Connected successfully.</p>
    <p><a href="/connected">View Threaded profile and Honey wallet</a></p>
    <form action="/disconnect" method="post"><button type="submit">Disconnect</button></form>
  </body>
</html>`);
  }

  return response.type('html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Threadbound integration spike</title></head>
  <body>
    <h1>Threadbound ↔ Threaded</h1>
    <p>This spike proves that a separate repository can authenticate through Threaded and read the current user's Honey balance.</p>
    <p><a href="/auth/threaded">Connect with Threaded</a></p>
  </body>
</html>`);
});

app.get('/auth/threaded', (request, response) => {
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  const state = createOAuthState();

  request.session.oauth = { codeVerifier, state };

  response.redirect(
    threaded.getAuthorizationUrl({
      state,
      codeChallenge,
      scopes: ['profile:read', 'wallet:read'],
    }),
  );
});

app.get('/oauth/callback', async (request, response) => {
  const pending = request.session.oauth;
  const { code, state, error, error_description: errorDescription } = request.query;

  if (error) {
    delete request.session.oauth;
    return response.status(400).json({
      error: 'oauth_authorization_failed',
      message: errorDescription || String(error),
    });
  }

  if (!pending || !state || state !== pending.state) {
    delete request.session.oauth;
    return response.status(400).json({
      error: 'invalid_oauth_state',
      message: 'OAuth state did not match the session that started the login.',
    });
  }

  if (!code) {
    delete request.session.oauth;
    return response.status(400).json({
      error: 'missing_authorization_code',
      message: 'Threaded did not return an authorization code.',
    });
  }

  try {
    const token = await threaded.exchangeAuthorizationCode({
      code: String(code),
      codeVerifier: pending.codeVerifier,
    });

    const [profile, wallet] = await Promise.all([
      threaded.getCurrentUser(token.access_token),
      threaded.getWallet(token.access_token),
    ]);

    request.session.threaded = {
      accessToken: token.access_token,
      profile,
      wallet,
      connectedAt: new Date().toISOString(),
    };
    delete request.session.oauth;

    return response.redirect('/connected');
  } catch (caught) {
    delete request.session.oauth;

    if (caught instanceof ThreadedApiError) {
      return response.status(caught.status || 502).json({
        error: caught.code || 'threaded_api_error',
        message: caught.message,
      });
    }

    console.error(caught);
    return response.status(502).json({
      error: 'threaded_connection_failed',
      message: 'Threadbound could not complete the Threaded connection.',
    });
  }
});

app.get('/connected', (request, response) => {
  if (!request.session.threaded) {
    return response.status(401).json({
      connected: false,
      message: 'Connect with Threaded first.',
    });
  }

  return response.json({
    connected: true,
    threaded_user: request.session.threaded.profile,
    wallet: request.session.threaded.wallet,
    connected_at: request.session.threaded.connectedAt,
  });
});

app.post('/disconnect', (request, response, next) => {
  request.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    response.redirect('/');
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({
    error: 'internal_error',
    message: 'Threadbound encountered an unexpected error.',
  });
});

app.listen(config.port, '127.0.0.1', () => {
  console.log(`Threadbound integration spike listening on http://127.0.0.1:${config.port}`);
});
