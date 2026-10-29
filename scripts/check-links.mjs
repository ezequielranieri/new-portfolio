#!/usr/bin/env node
// Link checker: walks every source/Markdown link in the committed content and
// source trees and verifies each link with an HTTP HEAD request.
//
// DNS failures (NXDOMAIN / ENOTFOUND) report as errors because a dead domain is
// a content bug, not a transient network problem. HTTP 405 (method not allowed)
// falls back to a GET probe so HEAD-only-blocking servers do not fail the gate.
//
// Usage: node scripts/check-links.mjs

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const SCAN_DIRS = [
  'src/content',
  'src/pages',
  'src/components',
  'src/layouts',
];

const SKIP = [
  'github.com/', // public GitHub links can rate-limit CI on unauthenticated HEAD requests
  'resend.com/',
  'upstash.com',
  'challenges.cloudflare.com',
  'astro.build/',
];

const LINK_RE = /https?:\/\/[^\s"'`)}\]]+/g;

function collectLinks(text) {
  return [...text.matchAll(LINK_RE)]
    .map((m) => m[0].replace(/[.,;]$/, ''))
    .filter((u) => !SKIP.some((s) => u.includes(s)));
}

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, out);
    } else if (/\.(md|mdx|astro|tsx?|mjs)$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

async function head(url) {
  let res;
  try {
    res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err?.cause?.code === 'ENOTFOUND') {
      return { err: `DNS failure for ${url}` };
    }
    return { err: `request failed for ${url}: ${err.message}` };
  }
  if (res.status === 405) {
    // Some servers reject HEAD; retry with GET.
    try {
      res = await fetch(url, { method: 'GET', redirect: 'follow' });
    } catch (err) {
      return { err: `request failed for ${url}: ${err.message}` };
    }
  }
  if (res.status >= 400) {
    return { err: `HTTP ${res.status} for ${url}` };
  }
  return { ok: true };
}

const files = (
  await Promise.all(SCAN_DIRS.map((d) => walk(path.join(ROOT, d))))
).flat();

const links = new Map();
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const link of collectLinks(text)) {
    if (!links.has(link)) links.set(link, file);
  }
}

const failures = [];
for (const [link, file] of links) {
  const result = await head(link);
  if (result.err) {
    failures.push({ link, file: path.relative(ROOT, file), error: result.err });
    console.error(`LINK FAIL ${link} (${file})`);
  } else {
    console.log(`LINK OK   ${link}`);
  }
}

console.log(`\nChecked ${links.size} unique links.`);
if (failures.length > 0) {
  process.exitCode = 1;
  console.error(`${failures.length} link(s) failed.`);
} else {
  console.log('All links OK.');
}
