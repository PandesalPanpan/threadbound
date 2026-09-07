import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function runConfig(extraEnv) {
  const env = { ...process.env, SESSION_SECRET: 'test-session-secret', ...extraEnv };
  delete env.THREADED_BASE_URL;
  delete env.THREADED_CLIENT_ID;
  delete env.THREADED_REDIRECT_URI;
  Object.assign(env, extraEnv);
  return spawnSync(process.execPath, ['--input-type=module', '-e', "import('./src/config.js').then(({config}) => console.log(JSON.stringify({authMode: config.authMode, threaded: config.threaded})))"], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
}

test('local auth starts without any Threaded configuration', () => {
  const result = runConfig({ NODE_ENV: 'development', THREADBOUND_AUTH_MODE: 'local' });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.authMode, 'local');
  assert.equal(parsed.threaded, null);
});

test('production rejects local auth mode', () => {
  const result = runConfig({ NODE_ENV: 'production', THREADBOUND_AUTH_MODE: 'local' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Local auth mode is disabled in production/i);
});
