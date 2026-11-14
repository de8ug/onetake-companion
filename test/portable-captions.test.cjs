const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkspace } = require('../src/workspace.cjs');
const { seedPlan, validatePlan, generatePlan } = require('../src/project-generation.cjs');
const { validateCaptions } = require('../src/captions.cjs');
test('authored bilingual captions, chapter, cover and stable identity survive library rebuild', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onetake-portable-'));
  try {
    const w = createWorkspace({ root: tmp, downloads: path.join(tmp, 'downloads') });
    const plan = seedPlan('talkinghead'); plan.coverBackground = 'ink';
    plan.segments[0].captions.lines[0].translationEmphasis = 'specific problem';
    const record = await w.create(plan);
    const first = JSON.parse(w.read(record.id, 'project.onetake.json'));
    assert.equal(first.projectId, record.id);
    assert.equal(first.talkingHead.cover.background, 'ink');
    assert.deepEqual(first.talkingHead.directorPlan.segments[0].captions, plan.segments[0].captions);
    assert.equal(first.talkingHead.directorPlan.segments[0].chapterTitle, '问题');
    assert(first.talkingHead.directorPlan.segments[1].cues.every(c => c.atProgress > 0));
    const english = { ...plan, language: 'en' }; english.segments[0].text = 'Start with one clear problem.';
    await w.pack(english, record.id);
    const next = JSON.parse(w.read(record.id, 'project.onetake.json'));
    assert.equal(next.projectId, first.projectId);
    assert.equal(next.talkingHead.activeLanguage, 'en');
    assert.equal(next.talkingHead.directorPlan.segments[0].script.en, english.segments[0].text);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('malformed captions fail clearly instead of silently losing editorial data', () => {
  for (const bad of [{ mode: 'key', lines: [{ text: 'a', emphasis: 'missing' }] }, { mode: 'key', lines: [{ text: 'a', dwell: 5 }] }, { mode: 'key', lines: [{ text: 'a', translation: 'b', translationEmphasis: 'c' }] }]) assert.throws(() => validateCaptions(bad));
  const old = seedPlan('talkinghead'); delete old.segments[0].captions;
  assert.equal(validatePlan(old).segments[0].captions, undefined);
});
test('AI output must respect requested language and include bilingual captions', async () => {
  const input = { mode: 'talkinghead', provider: 'minimax', topic: '表达', audience: '普通人', language: 'en' };
  const mock = plan => async () => ({ data: { choices: [{ message: { content: JSON.stringify(plan) } }] } });
  await assert.rejects(generatePlan(input, mock(seedPlan('talkinghead'))), /语言/);
  const plan = seedPlan('talkinghead'); plan.language = 'en'; delete plan.segments[0].captions;
  await assert.rejects(generatePlan(input, mock(plan)), /双语字幕/);
});
