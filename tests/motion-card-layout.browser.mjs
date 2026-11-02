import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Run against the local development app; provider requests are intercepted below.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  let finished = false;
  const created = Date.now() - 10000;
  const fixture = {
    id: '11111111-1111-4111-8111-111111111111', taskId: 'task_layout_rendering',
    provider: 'kie', model: 'wan', label: 'Wan 3', mode: 'reference',
    prompt: 'Layout regression fixture', seconds: 2, resolution: '480p',
    estimatedCredits: 1.32, creditsConsumed: 1.32, created, updated: created + 10000,
    preserveInputAudio: false,
  };
  const jobs = () => [
    { ...fixture, state: finished ? 'success' : 'generating',
      ...(finished ? { resultUrls: ['/trial/motion-2s.mp4'], completedAt: created + 10000 } : {}) },
    { ...fixture, id: '22222222-2222-4222-8222-222222222222', taskId: 'task_layout_completed',
      state: 'success', resultUrls: ['/trial/motion-2s.mp4'], completedAt: created + 10000 },
  ];
  await page.route('**/api/kie/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/kie/config') {
      return route.fulfill({ json: request.method() === 'GET'
        ? { configured: true, mediaReady: true } : { connected: true, credits: 10000 } });
    }
    if (url.pathname === '/api/kie/pricing') return route.fulfill({ status: 503, json: { error: 'No generation pricing required for layout fixtures.' } });
    assert.equal(request.method(), 'GET', 'Layout checks must never submit a generation');
    if (url.pathname === '/api/kie/motion') return route.fulfill({ json: { jobs: jobs() } });
    if (url.pathname.startsWith('/api/kie/motion/')) return route.fulfill({ json: { job: jobs()[0] } });
    return route.abort();
  });
  await page.goto(process.env.GENJUTSU_BASE_URL ?? 'http://127.0.0.1:3107/generations', { waitUntil: 'domcontentloaded' });
  const cards = page.locator('.motion-history .job-card');
  await cards.nth(1).waitFor();
  const identity = page.getByRole('group', { name: 'Identity and face', exact: true });
  assert.ok(await identity.getByRole('radio', { name: 'Input image', exact: true }).isChecked());
  assert.ok(await identity.getByRole('radio', { name: 'Input video', exact: true }).isDisabled());
  const prompt = page.getByRole('textbox', { name: 'Prompt', exact: true });
  assert.ok((await prompt.inputValue()).startsWith('A photorealistic video of the character from Image1 @Image1.'));
  assert.ok((await prompt.inputValue()).includes('FACIAL IDENTITY — HIGHEST PRIORITY:'));
  await page.getByRole('group', { name: 'Opening frame source', exact: true })
    .getByRole('radio', { name: 'Input image', exact: true }).check();
  assert.ok((await prompt.inputValue()).includes('The first frame exactly matches Image1 @Image1.'));
  assert.ok((await prompt.inputValue()).length < 1200);
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
  console.log('Card and preview heights match in desktop/mobile Grid and List views; completion causes no height jump. No provider requests were sent.');
} finally {
  await browser.close();
}
