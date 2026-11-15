const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createSourceInbox, validateMaterials } = require('../src/source-materials.cjs');
const { createWorkspace } = require('../src/workspace.cjs');
const { seedPlan, generatePlan } = require('../src/project-generation.cjs');
const { createServer } = require('../src/server.cjs');
const dataUrl = 'data:image/png;base64,' + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(120)]).toString('base64');
const materials = { text: 'Synthetic reference, not final narration.', images: [{ id: 'img-1', name: 'diagram.png', dataUrl }] };
test('source inbox expires, consumes once, and rejects unsafe image payloads', () => {
  let time = 0; const inbox = createSourceInbox(() => time);
  const token = inbox.put({ topic: 'Explain this', materials }, 'https://onetake.show');
  assert.deepEqual(inbox.consume(token).materials, materials);
  assert.throws(() => inbox.consume(token));
  const next = inbox.put({ topic: 'Explain this', materials }, 'https://onetake.show');
  time = 600001; assert.throws(() => inbox.consume(next));
  assert.throws(() => validateMaterials({ ...materials, images: [{ ...materials.images[0], dataUrl: 'https://example.com/image.png' }] }));
  assert.throws(() => validateMaterials({ ...materials, text: 'x'.repeat(20001) }));
});
test('AI receives reference text only; selected local source images survive save, reopen and portable export', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onetake-source-test-'));
  try {
    const { plan } = await generatePlan({ mode: 'talkinghead', provider: 'minimax', topic: 'Explain this', audience: 'Creators', notes: materials.text, referenceMaterials: materials }, async (_, messages) => {
      assert(JSON.stringify(messages).includes(materials.text));
      assert(!JSON.stringify(messages).includes(dataUrl));
      return { model: 'mock', data: { choices: [{ message: { content: JSON.stringify(seedPlan('talkinghead')) } }] } };
    });
    plan.segments[0].referenceImageId = 'img-1'; plan.segments[1].referenceImageId = 'img-1';
    const w = createWorkspace({ root: tmp }); const p = await w.create(plan);
    const portable = JSON.parse(w.read(p.id, 'project.onetake.json'));
    assert(portable.talkingHead.brollAssets.some(a => a.imageDataUrl === dataUrl));
    const saved = JSON.parse(w.read(p.id, 'content-plan.json'));
    assert.deepEqual(saved.referenceMaterials, materials);
    assert.equal(saved.segments[0].image.filename, saved.segments[1].image.filename);
    await w.removeImage(p.id, saved.segments[0].id);
    assert(fs.existsSync(path.join(w.dir(p.id), 'assets', saved.segments[1].image.filename)));
    await w.pack(JSON.parse(w.read(p.id, 'content-plan.json')), p.id);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('website handoff requires pairing, consumption requires same-origin local UI, and never calls AI', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onetake-source-http-'));
  const reserve = http.createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r));
  const port = reserve.address().port; await new Promise(r => reserve.close(r));
  let calls = 0;
  const { server } = createServer({ port, home: path.join(tmp, 'home'), workspaceRoot: path.join(tmp, 'workspace'), generate: async () => { calls++; throw new Error(); } });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  const base = `http://127.0.0.1:${port}`;
  const auth = 'Bearer ' + fs.readFileSync(path.join(tmp, 'home/pairing-token'), 'utf8');
  const post = (url, body, headers) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('/workbench/source-drafts', { topic: 'test', materials }, { Origin: 'https://onetake.show' })).status, 401);
    assert.equal((await post('/workbench/source-drafts', { topic: 'test', materials }, { Origin: 'https://untrusted.example', Authorization: auth })).status, 403);
    const accepted = await post('/workbench/source-drafts', { topic: 'test', materials }, { Origin: 'https://onetake.show', Authorization: auth });
    assert.equal(accepted.status, 200); const { ticket } = await accepted.json();
    assert.equal((await post('/workbench/source-drafts/consume', { ticket }, { Origin: 'https://onetake.show', Authorization: auth })).status, 403);
    const page = await fetch(base); const Cookie = page.headers.get('set-cookie').split(';')[0];
    const received = await post('/workbench/source-drafts/consume', { ticket }, { Origin: base, Cookie });
    assert.equal(received.status, 200); assert.deepEqual((await received.json()).materials, materials);
    assert.equal((await post('/workbench/source-drafts/consume', { ticket }, { Origin: base, Cookie })).status, 410);
    assert.equal(calls, 0);
  } finally { await new Promise(r => server.close(r)); fs.rmSync(tmp, { recursive: true, force: true }); }
});
