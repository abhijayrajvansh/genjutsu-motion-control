#!/usr/bin/env node
import { chromium } from 'playwright';
import { appendFile, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const outputOption = args.indexOf('--output');
if (outputOption >= 0 && (!args[outputOption + 1] || args[outputOption + 1].startsWith('--'))) {
  throw new Error('--output requires a directory');
}
const output = path.resolve(outputOption < 0
  ? path.join(homedir(), 'Desktop', 'sonali', 'ideas')
  : args[outputOption + 1]);
const links = args.filter((arg, index) => arg !== '--watch'
  && (outputOption < 0 || (index !== outputOption && index !== outputOption + 1)));
if (!watch && links.length === 0) {
  console.log('Usage: npm run reels -- [--watch] [--output directory] <instagram-url> ...');
  process.exit(0);
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const probe = promisify(execFile);
let failures = 0;

async function exists(file) {
  try { return (await stat(file)).size > 0; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function validate(file) {
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, 12, 0);
    if (bytesRead !== 12 || header.toString('ascii', 4, 8) !== 'ftyp') {
      throw new Error('Server returned a non-MP4 file');
    }
  } finally { await handle.close(); }
  // Also check for an actual video stream when ffprobe is installed.
  try {
    const { stdout } = await probe('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_type', '-of', 'json', file]);
    const streams = JSON.parse(stdout).streams ?? [];
    if (!streams.some(stream => stream.codec_type === 'video')) {
      throw new Error('Downloaded file has no video stream');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function download(raw) {
  const url = new URL(raw);
  const match = url.pathname.match(/^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/);
  if (!['instagram.com', 'www.instagram.com'].includes(url.hostname) || !match || url.protocol !== 'https:') {
    throw new Error('Expected a public HTTPS Instagram post or reel URL');
  }
  const id = match[1];
  const source = `https://www.instagram.com${url.pathname}`;
  console.log(`FETCH ${id}`);
  await page.goto('https://fastvideosave.net/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  const input = page.getByRole('textbox', { name: 'Media link' });
  await input.fill(source);
  await input.press('Enter');
  try {
    await page.locator('a[data-action="dl"]').first().waitFor({ state: 'visible', timeout: 90000 });
  } catch {
    throw new Error('Fastvideosave did not offer a download server; check the browser for a site error or verification prompt');
  }
  const servers = await page.locator('a[data-action="dl"]').evaluateAll(elements => elements.map(element => ({
    label: element.textContent.trim(), url: element.href,
  })));
  const counts = new Map();
  const groups = [];
  for (const server of servers) {
    const number = server.label.match(/SERVER\s*(\d+)/i)?.[1];
    if (!number) continue;
    const index = counts.get(number) ?? 0;
    counts.set(number, index + 1);
    (groups[index] ??= []).push(server);
  }
  if (!groups.length) throw new Error('No available download servers');
  for (const [index, alternatives] of groups.entries()) {
    const name = `${id}${index === 0 ? '' : `-${index + 1}`}.mp4`;
    const destination = path.join(output, name);
    if (await exists(destination)) {
      await validate(destination);
      console.log(`SKIP ${name} (already downloaded)`);
      continue;
    }
    let saved = false;
    for (const server of alternatives) {
      const temporary = `${destination}.${process.pid}.part`;
      let response;
      try {
        console.log(`TRY ${id}: ${server.label}`);
        response = await context.request.get(server.url, { timeout: 45000 });
        if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
        const buffer = await response.body();
        const handle = await open(temporary, 'wx');
        try { await handle.writeFile(buffer); } finally { await handle.close(); }
        await validate(temporary);
        await rename(temporary, destination);
        saved = true;
        console.log(`SAVED ${destination} (${buffer.length} bytes)`);
        await appendFile(path.join(output, '.reel-downloads.jsonl'), `${JSON.stringify({
          source, file: name, server: server.label, bytes: buffer.length, downloadedAt: new Date().toISOString(),
        })}\n`).catch(() => console.warn(`Could not update download log for ${name}`));
        break;
      } catch {
        console.warn(`FAILED ${server.label} for ${id}; trying next available server`);
      } finally {
        await response?.dispose();
        await rm(temporary, { force: true });
      }
    }
    if (!saved) throw new Error(`All available servers failed for ${name}`);
  }
}

async function processText(text) {
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    try { await download(raw); }
    catch (error) {
      failures += 1;
      // Avoid printing signed CDN URLs from networking exceptions.
      console.error(`FAILED ${raw}: ${error.message.includes('https://') ? 'Browser or network error' : error.message}`);
    }
  }
}

// Start reading immediately so links pasted while a download runs stay queued.
const inputLines = watch ? createInterface({ input: process.stdin, crlfDelay: Infinity }) : null;
const queuedLines = inputLines?.[Symbol.asyncIterator]();
try {
  console.log(`Saving to ${output}`);
  for (const link of links) await processText(link);
  if (watch) {
    console.log('READY: paste Instagram URLs, one or many per line. Ctrl-D exits.');
    for await (const line of { [Symbol.asyncIterator]: () => queuedLines }) await processText(line);
  }
} finally {
  inputLines?.close();
  await browser.close();
}
process.exitCode = failures ? 1 : 0;
