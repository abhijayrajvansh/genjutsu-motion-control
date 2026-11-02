import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

// Exercise the real server media store without creating a provider task.
const require = createRequire(import.meta.url), modules = new Map();
function serverModule(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file).exports;
  const loadedModule = { exports: {} };
  modules.set(file, loadedModule);
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const dependency = name => name === 'server-only' ? {} : name.startsWith('@/')
    ? serverModule(`${name.slice(2)}.ts`) : name.startsWith('.')
      ? serverModule(`${path.resolve(path.dirname(file), name)}.ts`) : require(name);
  new Function('require', 'module', 'exports', source)(dependency, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const { saveMotionInputs, loadMotionInputs, readMotionInput } = serverModule('lib/server/motion-inputs.ts');
const fixtureIds = Array.from({ length: 6 }, () => randomUUID());
const testKey = 'generation-inputs-fixture-key';
const owner = createHash('sha256').update(testKey).digest('hex');
const baseUrl = process.env.GENJUTSU_BASE_URL ?? 'http://127.0.0.1:3107/generations';

// Run against the local development app; provider requests are intercepted below.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.addInitScript(key => {
    localStorage.setItem('clone.kie.api-key', key);
    localStorage.setItem('clone.motion.output-sourcing.v1', JSON.stringify({ sources: {
      identity: 'video', clothing: 'video', openingFrame: 'video', background: 'image',
    } }));
  }, testKey);
  let finished = false;
  let submittedPrompt;
  const created = Date.now() - 10000;
  const fixture = {
    id: fixtureIds[0], taskId: 'task_layout_rendering',
    provider: 'kie', model: 'wan', label: 'Wan 3', mode: 'reference',
    prompt: 'Layout regression fixture', seconds: 2, resolution: '480p',
    estimatedCredits: 1.32, creditsConsumed: 1.32, created, updated: created + 10000,
    preserveInputAudio: false,
    selection: { start: 0, end: 2, sourceSeconds: 2 },
  };
  const jobs = () => [
    { ...fixture, state: finished ? 'success' : 'generating',
      ...(finished ? { resultUrls: ['/trial/motion-2s.mp4'], completedAt: created + 10000 } : {}) },
    { ...fixture, id: fixtureIds[1], taskId: 'task_layout_completed',
      state: 'success', resultUrls: ['/trial/motion-2s.mp4'], completedAt: created + 10000 },
    { ...fixture, id: fixtureIds[2], taskId: undefined, state: 'success',
      resultUrls: ['/trial/motion-2s.mp4'], completedAt: created + 10000 },
  ];
  const image = new File([await readFile('public/trial/reference.png')], 'original-reference.png', { type: 'image/png' });
  const video = new File([await readFile('public/trial/motion-2s.mp4')], 'submitted-clip.mp4', { type: 'video/mp4' });
  await mkdir('.data/motion', { recursive: true });
  for (const job of jobs()) {
    await writeFile(`.data/motion/${job.id}.json`, JSON.stringify({ ...job, owner }), { flag: 'wx', mode: 0o600 });
  }
  for (const id of fixtureIds.slice(0, 2)) {
    const entries = await saveMotionInputs(id, [image], video);
    assert.equal(entries.length, 2);
    assert.deepEqual((await readMotionInput(id, 'image-1')).data, Buffer.from(await image.arrayBuffer()));
    assert.deepEqual((await readMotionInput(id, 'video')).data, Buffer.from(await video.arrayBuffer()));
    assert.equal((await loadMotionInputs({ ...fixture, id, owner }, testKey)).length, 2);
  }
  await assert.rejects(readMotionInput(fixtureIds[0], '../manifest.json'), /Input not found/);
  // Extra references and a corrected opening frame are also retained.
  await saveMotionInputs(fixtureIds[3], [image, image], video, image);
  assert.equal((await loadMotionInputs({ ...fixture, id: fixtureIds[3], owner }, testKey)).length, 4);
  const realFetch = globalThis.fetch;
  let remoteReads = 0;
  let expired = false;
  globalThis.fetch = async (value, options) => {
    const url = new URL(value);
    if (url.hostname === 'api.kie.ai') return Response.json({ code: 200, data: {
      model: 'wan/3-0-video', param: JSON.stringify({ input: JSON.stringify({
        reference_image_urls: ['https://tempfile.redpandaai.co/recovered.png', 'http://127.0.0.1/private.png'],
        reference_video_urls: ['https://tempfile.redpandaai.co/recovered.mp4'],
      }) }),
    } });
    assert.equal(url.hostname, 'tempfile.redpandaai.co', 'Recovery must not fetch untrusted upload hosts');
    assert.equal(options?.headers?.Authorization, undefined, 'API keys must not be sent to upload hosts');
    remoteReads++;
    if (expired) return new Response('', { status: 410 });
    return new Response(await (url.pathname.endsWith('.png') ? image : video).arrayBuffer());
  };
  try {
    const legacy = { ...fixture, id: fixtureIds[4], owner };
    const recovered = await loadMotionInputs(legacy, testKey);
    assert.equal(recovered.length, 2, 'Legacy provider parameters should recover both inputs and ignore private URLs');
    assert.ok(recovered.every(input => !('remoteUrl' in input)), 'Public metadata must omit provider URLs');
    await readMotionInput(legacy.id, 'image-1');
    await readMotionInput(legacy.id, 'video');
    await readMotionInput(legacy.id, 'video');
    assert.equal(remoteReads, 2, 'Recovered files must be cached durably');
    expired = true;
    await loadMotionInputs({ ...legacy, id: fixtureIds[5] }, testKey);
    await assert.rejects(readMotionInput(fixtureIds[5], 'image-1'), error => error.status === 410);
  } finally { globalThis.fetch = realFetch; }
  await page.route('**/api/kie/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.endsWith('/inputs')) return route.continue();
    if (url.pathname === '/api/kie/config') {
      return route.fulfill({ json: request.method() === 'GET'
        ? { configured: true, mediaReady: true } : { connected: true, credits: 10000 } });
    }
    if (url.pathname === '/api/kie/pricing') return route.fulfill({ json: { pricing: {
      model: 'wan', rates: { '480p': 0.1 }, billsReferenceVideo: false,
      freeImages: 4, extraImageCredits: 0, sourceUrl: 'https://example.com/mock-pricing', checkedAt: new Date().toISOString(),
    } } });
    if (url.pathname === '/api/kie/motion' && request.method() === 'POST') {
      const form = await new Response(request.postDataBuffer(), {
        headers: { 'content-type': request.headers()['content-type'] },
      }).formData();
      submittedPrompt = form.get('prompt');
      assert.ok(form.get('images') instanceof File);
      assert.ok(form.get('video') instanceof File);
      assert.equal(form.has('sources'), false);
      return route.fulfill({ status: 201, json: { job: jobs()[0] } });
    }
    assert.equal(request.method(), 'GET', 'Layout checks must never submit a generation');
    if (url.pathname === '/api/kie/motion') return route.fulfill({ json: { jobs: jobs() } });
    if (url.pathname.startsWith('/api/kie/motion/')) return route.fulfill({ json: { job: jobs()[0] } });
    return route.abort();
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const cards = page.locator('.motion-history .job-card');
  await cards.nth(1).waitFor();
  await cards.first().getByRole('button', { name: 'View inputs', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Generation inputs', exact: true });
  await dialog.getByRole('heading', { name: 'Reference photo', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.motion-inputs-grid img')?.naturalWidth > 0 &&
    document.querySelector('.motion-inputs-grid video')?.readyState >= 1);
  assert.equal(await dialog.getByRole('img', { name: 'original-reference.png' }).count(), 1);
  assert.equal(await dialog.getByLabel('Submitted driving video').count(), 1);
  assert.equal(await dialog.getByText('Submitted clip: 0.00–2.00 seconds', { exact: true }).count(), 1);
  await dialog.getByLabel('Submitted driving video').evaluate(video => { video.muted = true; return video.play(); });
  assert.equal(await dialog.getByLabel('Submitted driving video').evaluate(video => video.paused), false);
  await page.screenshot({ path: '/tmp/genjutsu-generation-inputs-desktop.png' });
  await page.setViewportSize({ width: 390, height: 900 });
  const dialogBounds = await dialog.boundingBox();
  assert.ok(dialogBounds.width <= 390);
  await page.screenshot({ path: '/tmp/genjutsu-generation-inputs-mobile.png' });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await cards.nth(2).getByRole('button', { name: 'View inputs', exact: true }).click();
  await dialog.getByText('The original photo was not recorded or is no longer available.', { exact: true }).waitFor();
  await dialog.getByText('The original video was not recorded or is no longer available.', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const apiUrl = new URL(`/api/kie/motion/${fixtureIds[0]}/inputs`, baseUrl).href;
  for (const suffix of ['', '?file=image-1', '?file=video']) {
    const denied = await page.request.get(apiUrl + suffix, { headers: { 'x-kie-key': 'different-fixture-owner' } });
    assert.equal(denied.status(), 404, 'Other keys must not access generation inputs');
  }
  const invalid = await page.request.get(`${apiUrl}?file=..%2Fmanifest.json`, { headers: { 'x-kie-key': testKey } });
  assert.equal(invalid.status(), 404);
  assert.equal(await page.getByRole('heading', { name: 'Final Output Sourcing', exact: true }).count(), 0);
  assert.equal(await page.getByRole('group', { name: 'Identity and face', exact: true }).count(), 0);
  const prompt = page.getByRole('textbox', { name: 'Prompt', exact: true });
  const defaultPrompt = await prompt.inputValue();
  assert.ok(defaultPrompt.startsWith('A photorealistic video of the character from Image1 @Image1.'));
  assert.ok(defaultPrompt.includes('The first frame exactly matches Image1 @Image1.'));
  assert.ok(!defaultPrompt.includes('FACIAL IDENTITY — HIGHEST PRIORITY:'));
  const customPrompt = 'Use Image1 @Image1 for the character. Follow Video1 @Video1 for movement. Complete manual prompt; do not add source instructions.';
  await prompt.fill(customPrompt);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(expected => document.querySelector('.motion-live-prompt textarea')?.value === expected, customPrompt);
  await page.getByRole('button', { name: 'Load 2-second trial', exact: true }).click();
  await page.getByText('Trial ready:', { exact: false }).waitFor();
  assert.equal(await prompt.inputValue(), customPrompt, 'Changing input assets must preserve the complete prompt');
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/kie/motion') && response.request().method() === 'POST'),
    page.getByRole('button', { name: /^Generate 2s video/ }).click(),
  ]);
  assert.equal(submittedPrompt, customPrompt, 'The submitted prompt must exactly match the visible complete prompt');
  await page.getByRole('button', { name: 'Use default', exact: true }).click();
  assert.equal(await prompt.inputValue(), defaultPrompt);
  await prompt.fill('');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.motion-live-prompt textarea')?.value === '');
  await page.getByRole('button', { name: 'Use default', exact: true }).click();
  assert.equal(await prompt.inputValue(), defaultPrompt);
  await cards.nth(1).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.real-result')].every(video => video.readyState >= 1));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of ['Grid', 'List']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      const pendingMedia = await cards.first().locator('.render-preview').boundingBox();
      const readyMedia = await cards.nth(1).locator('.real-result').boundingBox();
      const pendingCard = await cards.first().boundingBox();
      const readyCard = await cards.nth(1).boundingBox();
      assert.ok(Math.abs(pendingMedia.height - readyMedia.height) <= 1,
        `${view} at ${width}px: rendering preview ${pendingMedia.height}px, completed preview ${readyMedia.height}px`);
      if (Math.abs(pendingCard.height - readyCard.height) > 1) {
        console.log(await cards.evaluateAll(elements => elements.map(element => [...element.children].map(child => ({
          className: child.className, height: child.getBoundingClientRect().height,
          text: child.classList.contains('job-meta-row') ? child.textContent : undefined,
          children: child.classList.contains('between') ? [...child.children].map(item => ({
            className: item.className, height: item.getBoundingClientRect().height, text: item.textContent,
          })) : undefined,
        })))));
      }
      assert.ok(Math.abs(pendingCard.height - readyCard.height) <= 1,
        `${view} at ${width}px: rendering card ${pendingCard.height}px, completed card ${readyCard.height}px`);
      assert.ok(await cards.first().getByRole('button', { name: 'Download video', exact: true }).isDisabled());
      assert.ok(await cards.nth(1).getByRole('button', { name: 'Download video', exact: true }).isEnabled());
      assert.equal(await cards.first().locator('.job-actions').getByRole('button', { name: 'Refresh status', exact: true }).count(), 0);
      assert.equal(await cards.first().getByRole('button', { name: 'Add to favorites', exact: true })
        .evaluate(button => button.previousElementSibling?.getAttribute('aria-label')), 'Refresh status');
    }
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  const before = await cards.first().boundingBox();
  finished = true;
  await cards.first().getByRole('button', { name: 'Refresh status', exact: true }).click();
  await cards.first().locator('.real-result').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.real-result')].every(video => video.readyState >= 1));
  const after = await cards.first().boundingBox();
  assert.ok(Math.abs(before.height - after.height) <= 1, `Card resized on completion: ${before.height}px → ${after.height}px`);
  console.log('Direct prompt persists across reloads and input changes, submits unchanged, and resets correctly. Source controls are disconnected. Card heights match in desktop/mobile Grid and List views. No provider requests were sent.');
  console.log('Input photo/video are saved durably, preview and play in the dialog, missing legacy inputs are explained, and other API keys are denied.');
} finally {
  await browser.close();
  for (const id of fixtureIds) {
    await rm(`.data/motion/${id}.json`, { force: true });
    await rm(`.data/motion-inputs/${id}`, { recursive: true, force: true });
  }
}
