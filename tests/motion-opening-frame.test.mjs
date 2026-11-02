import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMotionSourcePrompt,
  MOTION_PROMPT_LIMIT,
  MOTION_SOURCING_FIELDS,
  readMotionSourcing,
} from '../lib/motion-sourcing.ts';
import { apimartMotionPayload, motionPayload } from '../lib/motion-models.ts';

test('old and malformed saved settings default the opening source to video', () => {
  for (const stored of ['{}', 'null', 'bad json', '{"sources":{"openingFrame":"invalid"}}']) {
    assert.equal(readMotionSourcing(stored).sources.openingFrame, 'video');
  }
});

test('saved image opening survives normalization without changing clothing selection', () => {
  const result = readMotionSourcing('{"sources":{"openingFrame":"image","clothing":"video"}}');
  assert.equal(result.sources.openingFrame, 'image');
  assert.equal(result.sources.clothing, 'video');
});

test('changing opening source changes the requested first frame while retaining video motion', () => {
  const sources = readMotionSourcing('{}').sources;
  for (const [choice, reference] of [['image', 'Image1 @Image1'], ['video', 'Video1 @Video1']]) {
    const prompt = buildMotionSourcePrompt({ ...sources, openingFrame: choice });
    assert.ok(prompt.includes(`The first frame ${choice === 'image' ? 'exactly matches' : 'follows'} ${reference}`), prompt);
    assert.ok(prompt.includes('exact same movements, gestures, actions'));
    assert.ok(prompt.includes('same timing'));
  }
});

test('every source combination fits the provider prompt budget', () => {
  const fields = MOTION_SOURCING_FIELDS;
  for (let mask = 0; mask < 2 ** fields.length; mask++) {
    const sources = Object.fromEntries(fields.map((field, index) => [field.id, mask & (1 << index) ? 'image' : 'video']));
    assert.ok(buildMotionSourcePrompt(sources).length <= MOTION_PROMPT_LIMIT);
  }
});

test('image opening guidance retains reference mode and driving video in both provider requests', () => {
  const sources = { ...readMotionSourcing('{}').sources, openingFrame: 'image' };
  const input = {
    model: 'wan', mode: 'reference', prompt: buildMotionSourcePrompt(sources),
    seconds: 2, resolution: '480p', orientation: 'video', audio: false,
    imageUrls: ['https://example.com/appearance.png'], videoUrl: 'https://example.com/motion.mp4',
  };
  const kie = motionPayload(input);
  assert.deepEqual(kie.input.reference_video_urls, ['https://example.com/motion.mp4']);
  assert.equal(kie.input.first_frame_url, undefined);
  const apimart = apimartMotionPayload(input);
  assert.equal(apimart.generation_type, 'reference');
  assert.deepEqual(apimart.video_urls, ['https://example.com/motion.mp4']);
  assert.deepEqual(apimart.image_urls, ['https://example.com/appearance.png']);
  assert.equal(apimart.image_with_roles, undefined);
  assert.ok(apimart.prompt.includes('The first frame exactly matches 图1 @图1'));
});
