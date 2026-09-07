import { createHash, randomBytes } from 'node:crypto';

export function createCodeVerifier(byteLength = 64) {
  return randomBytes(byteLength).toString('base64url');
}

export function createCodeChallenge(codeVerifier) {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

export function createOAuthState(byteLength = 32) {
  return randomBytes(byteLength).toString('base64url');
}
