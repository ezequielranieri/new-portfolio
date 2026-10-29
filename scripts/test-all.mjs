#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 4324;
const BASE = `http://127.0.0.1:${PORT}`;

// Check if port is in use
try {
  execSync(`ss -ltnp | grep ':${PORT}'`, { stdio: 'pipe' });
  console.error(`Port ${PORT} is already in use. Stop the process first.`);
  process.exit(1);
} catch (e) {
  // Port is free, continue
}

// Serve the build from a child process. An in-process server would starve:
// the suites below are spawned, and spawnSync would block its event loop.
const serverScript = fileURLToPath(new URL('./test-all-server.mjs', import.meta.url));
const server = spawn(process.execPath, [serverScript], {
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, PORT: String(PORT) },
});

const serverExit = new Promise((resolve) => server.once('exit', resolve));
const stopServer = () => {
  if (server.exitCode === null) server.kill('SIGTERM');
};
process.once('exit', stopServer);
process.once('SIGINT', () => { stopServer(); process.exit(130); });
process.once('SIGTERM', () => { stopServer(); process.exit(143); });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());

let output = '';
const ready = new Promise((resolve, reject) => {
  server.stdout.setEncoding('utf8');
  server.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    output += chunk;
    if (output.includes('Preview server running')) resolve();
  });
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Static server exited early (code ${code})`)));
});

try {
  await ready;
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const env = { ...process.env, URL: BASE + '/' };

// TEST_EXCLUDE is a comma-separated list of suite names to skip. CI keeps its
// own profile without installing Playwright browsers.
const excluded = (process.env.TEST_EXCLUDE || '').split(',').filter(Boolean);

const tests = [
  { name: 'vitest', cmd: 'npx', args: ['vitest', 'run', 'tests/contact.test.ts', 'tests/contact-email.test.ts', 'tests/request-guards.test.ts', 'tests/rate-limit.test.ts', 'tests/turnstile.test.ts', 'tests/scanner-self-test.test.ts'] },
  { name: 'gate:desktop', cmd: 'npm', args: ['run', 'gate:desktop'] },
  { name: 'test:routes', cmd: 'npm', args: ['run', 'test:routes'] },
  { name: 'test:sitemap', cmd: 'npm', args: ['run', 'test:sitemap'] },
  { name: 'test:hreflang', cmd: 'npm', args: ['run', 'test:hreflang'] },
  { name: 'test:notice', cmd: 'npm', args: ['run', 'test:notice'] },
  { name: 'test:contact', cmd: 'npm', args: ['run', 'test:contact'] },
  { name: 'test:404', cmd: 'npm', args: ['run', 'test:404'] },
  { name: 'test:glyphs', cmd: 'npm', args: ['run', 'test:glyphs'] },
  { name: 'test:notfound-meta', cmd: 'npm', args: ['run', 'test:notfound-meta'] },
  { name: 'test:seo', cmd: 'npm', args: ['run', 'test:seo'] },
  { name: 'check:i18n', cmd: 'npm', args: ['run', 'check:i18n'] },
];

const run = (test) => new Promise((resolve) => {
  const child = spawn(test.cmd, test.args, { stdio: 'inherit', env });
  child.once('exit', (code) => resolve(code));
  child.once('error', () => resolve(1));
});

let allPassed = true;
for (const test of tests) {
  if (excluded.includes(test.name)) {
    console.log(`\n=== ${test.name} === SKIPPED (TEST_EXCLUDE)`);
    continue;
  }
  console.log(`\n=== ${test.name} ===`);
  const code = await run(test);
  if (code !== 0) {
    allPassed = false;
    console.error(`${test.name}: FAILED`);
  } else {
    console.log(`${test.name}: PASSED`);
  }
}

// Stop the server and wait for the port to be released before exiting.
stopServer();
await Promise.race([serverExit, delay(2000)]);
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
