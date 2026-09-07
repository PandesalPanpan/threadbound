import assert from 'node:assert/strict';
import test from 'node:test';
import { createCodeChallenge, createCodeVerifier, createOAuthState } from '../src/oauth/pkce.js';

test('creates the RFC 7636 S256 code challenge', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

  assert.equal(
    createCodeChallenge(verifier),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});

test('generates high-entropy verifier and state values', () => {
  const verifier = createCodeVerifier();
  const state = createOAuthState();

  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.match(state, /^[A-Za-z0-9_-]+$/);
  assert.ok(verifier.length >= 43);
  assert.ok(state.length >= 32);
  assert.notEqual(createCodeVerifier(), verifier);
  assert.notEqual(createOAuthState(), state);
});
