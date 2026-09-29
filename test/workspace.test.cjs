const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkspace } = require("../src/workspace.cjs");
const { seedPlan, validatePlan, generatePlan } = require("../src/project-generation.cjs");
test("two modes pack independently; tickets are origin-bound, one-use; Downloads references survive restart", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-test-"));
  try {
    const options = { root: path.join(tmp, "projects"), downloads: path.join(tmp, "Downloads") }; fs.mkdirSync(options.downloads);
    const w = createWorkspace(options);
    const th = await w.create(seedPlan("talkinghead")), wb = await w.create(seedPlan("whiteboard"));
    assert.equal(JSON.parse(w.read(th.id, "project.onetake.json")).version, 4);
    assert.equal(JSON.parse(w.read(wb.id, "project.onetake.json")).version, 2);
    assert.throws(() => w.dir("../outside"));
    assert.throws(() => w.handoff(th.id, "https://untrusted.example"));
    const token = w.handoff(th.id, "http://127.0.0.1:3001").url.split("=")[1];
    assert.throws(() => w.consume(token, "https://onetake.show"));
    assert.equal(w.consume(token, "http://127.0.0.1:3001").project.mode, "talkinghead");
    assert.throws(() => w.consume(token, "http://127.0.0.1:3001"));
    const filename = "主题_onetake_1790484033245.mp4"; const bytes = Buffer.alloc(1000, 1); fs.writeFileSync(path.join(options.downloads, filename), bytes);
    const rec = w.register(th.id, filename, bytes.length);
    assert.equal(w.register(th.id, filename, bytes.length).recordingId, rec.recordingId);
    assert.deepEqual(fs.readdirSync(path.join(w.dir(th.id), "originals")), []);
    assert.equal(createWorkspace(options).recording(th.id, rec.recordingId).file, path.join(options.downloads, filename));
    assert.throws(() => w.register(th.id, "../secret.mov", 1000));
    const link = "链接_onetake_1790484033245.mp4"; fs.symlinkSync(path.join(options.downloads, filename), path.join(options.downloads, link));
    assert.throws(() => w.register(th.id, link, bytes.length));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test("invalid model drafts fail rather than being advertised as complete projects", async () => {
  const plan = seedPlan("talkinghead"); plan.segments[0].emphasis = "没有"; plan.segments[0].quote = "一个词";
  assert.throws(() => validatePlan(plan));
  const input = { mode: "talkinghead", provider: "minimax", topic: "表达", audience: "普通人" };
  await assert.rejects(generatePlan(input, async () => ({ data: { choices: [{ message: { content: "invalid" } }] } })));
  const result = await generatePlan(input, async () => ({ model: "mock", data: { choices: [{ message: { content: JSON.stringify(seedPlan("talkinghead")) } }] } }));
  assert.equal(result.plan.publication.keywords.length, 4);
  const structures = ["problem", "comparison", "demonstration"].map(s => seedPlan("whiteboard", "表达", "普通人", s));
  assert.equal(new Set(structures.map(p => p.pages[1].text)).size, 3);
  assert.equal(structures[1].pages[1].board.diagram, "compare");
});
