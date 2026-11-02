import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMotionSourcePrompt, MOTION_SOURCING_FIELDS, readMotionSourcing } from '../lib/motion-sourcing.ts';

test('saved video-face settings cannot override the required image-face source', () => {
  const saved = readMotionSourcing('{"sources":{"identity":"video","clothing":"video"}}');
  assert.equal(saved.sources.identity, 'image');
  assert.equal(saved.sources.clothing, 'video');
});

test('image identity leads the concise prompt even for a stale video-identity value', () => {
  const sources = { ...readMotionSourcing('{}').sources, identity: 'video', openingFrame: 'image' };
  const prompt = buildMotionSourcePrompt(sources);
  assert.ok(prompt.startsWith('Edit Video1 @Video1: replace the person with the character from Image1 @Image1 throughout the clip.'));
  assert.ok(prompt.indexOf('FACIAL IDENTITY — HIGHEST PRIORITY:') < prompt.indexOf('Keep body proportions'));
  assert.ok(prompt.includes("Replace the original face with Image1 @Image1's face in every frame, including the first"));
  assert.ok(prompt.includes('Preserve its facial features through all angles and expressions'));
  assert.ok(prompt.includes('Transfer facial motion only from Video1 @Video1, without its identity or face blending'));
  assert.ok(prompt.includes("Replace the video's entire outfit with Image1 @Image1's clothing and skin coverage from first to last frame"));
  assert.ok(prompt.includes("Do not retain or blend in Video1 @Video1's garments, colors or layers"));
  assert.ok(prompt.includes('no reveal, morphing or delayed outfit change'));
  assert.ok(prompt.includes('The first frame exactly matches Image1 @Image1.'));
  assert.ok(prompt.includes('clothing and skin coverage'));
});

test('all source combinations keep the reduced default prompt under 1200 characters', () => {
  for (let mask = 0; mask < 2 ** MOTION_SOURCING_FIELDS.length; mask++) {
    const sources = Object.fromEntries(MOTION_SOURCING_FIELDS.map((field, index) => [field.id, mask & (1 << index) ? 'image' : 'video']));
    const prompt = buildMotionSourcePrompt(sources);
    assert.ok(prompt.length < 1200, `Prompt expanded to ${prompt.length} characters`);
    assert.equal(prompt.includes("Replace the video's entire outfit"), sources.clothing === 'image');
    assert.equal(prompt.includes('Keep clothing and skin coverage from Video1 @Video1 only'), sources.clothing === 'video');
  }
});

test('compact source grouping keeps video clothing separate from image face and background', () => {
  const sources = { ...readMotionSourcing('{}').sources, clothing: 'video', background: 'image', camera: 'image' };
  const prompt = buildMotionSourcePrompt(sources);
  assert.ok(prompt.includes('Keep clothing and skin coverage from Video1 @Video1 only, while replacing the face'));
  assert.ok(prompt.includes('Match background, camera framing and angle (fixed camera) from Image1 @Image1 only.'));
  assert.ok(prompt.includes('Match lighting from Video1 @Video1 only.'));
  assert.ok(prompt.includes("Replace the original face with Image1 @Image1's face"));
});
