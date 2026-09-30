const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkspace } = require("../src/workspace.cjs");
const { seedPlan, validatePlan, generatePlan } = require("../src/project-generation.cjs");
const { unzipSync } = require("fflate");
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

test("generated segment image is stored in assets, embedded in portable project, and removable", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-media-"));
  try {
    const root = path.join(tmp, "projects"), downloads = path.join(tmp, "Downloads"); fs.mkdirSync(downloads);
    const w = createWorkspace({ root, downloads });
    const project = await w.create(seedPlan("talkinghead"));
    const plan = JSON.parse(w.read(project.id, "content-plan.json"));
    const partId = plan.segments[1].id;
    const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(200)]);
    const added = await w.attachImage(project.id, partId, "一张无文字的说明图", { bytes, mime: "image/png" });
    assert.equal(w.image(project.id, added.filename).mime, "image/png");
    const savedPlan = JSON.parse(w.read(project.id, "content-plan.json"));
    assert.equal(savedPlan.segments[1].image.filename, added.filename);
    const native = JSON.parse(w.read(project.id, "project.onetake.json"));
    const asset = native.talkingHead.brollAssets.find(item => item.type === "image");
    assert.equal(asset.imageDataUrl, `data:image/png;base64,${bytes.toString("base64")}`);
    assert.equal(asset.source, "upload");
    assert(native.talkingHead.directorPlan.segments[1].cues.some(cue => cue.assetId === asset.id));
    assert.throws(() => w.image(project.id, "../secret.png"));
    await w.removeImage(project.id, partId);
    assert.equal(JSON.parse(w.read(project.id, "project.onetake.json")).talkingHead.brollAssets.some(item => item.type === "image"), false);
    assert.equal(fs.existsSync(path.join(w.dir(project.id), "assets", added.filename)), false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("moving a project to trash preserves referenced Downloads original", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-trash-"));
  try {
    const root = path.join(tmp, "projects"), downloads = path.join(tmp, "Downloads"); fs.mkdirSync(downloads);
    const w = createWorkspace({ root, downloads });
    const project = await w.create(seedPlan("talkinghead"));
    const filename = "主题_onetake_1790484033245.mp4";
    fs.writeFileSync(path.join(downloads, filename), Buffer.alloc(1000));
    w.register(project.id, filename, 1000);
    const moved = w.trash(project.id);
    assert.equal(w.list().length, 0);
    assert(fs.readdirSync(moved.trashDirectory).some(name => name.includes(project.id)));
    assert(fs.existsSync(path.join(downloads, filename)));
    assert.throws(() => w.dir(project.id), /未找到工程/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("whiteboard posters and distinct image copy are packaged without originals or local secrets", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-publish-"));
  try {
    const downloads = path.join(tmp, "Downloads"); fs.mkdirSync(downloads);
    const w = createWorkspace({ root: path.join(tmp, "projects"), downloads });
    const plan = seedPlan("whiteboard");
    plan.imagePublication = { description: "图文说明，和视频发布词不同。", keywords: ["图文", "讲解", "白板", "方法"] };
    const p = await w.create(plan);
    const poster = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(200)]);
    w.addPoster(p.id, 0, poster);
    assert.throws(() => w.addPoster(p.id, 500, poster));
    assert.throws(() => w.addPoster(p.id, 1, Buffer.alloc(200)));
    const original = "主题_onetake_1790484033245.mp4";
    fs.writeFileSync(path.join(downloads, original), Buffer.alloc(1000));
    w.register(p.id, original, 1000);
    const { filename } = w.bundle(p.id);
    const zip = unzipSync(w.read(p.id, filename));
    assert.equal(Buffer.from(zip["posters/page-01.png"]).equals(poster), true);
    assert.match(Buffer.from(zip["image-publication.md"]).toString(), /图文说明/);
    assert.match(Buffer.from(zip["video-publication.md"]).toString(), /分享一个/);
    assert.equal(Object.keys(zip).some(name => name.includes("original") || name.includes("pairing") || name.includes("key")), false);
    assert.equal(w.get(p.id).posters.length, 1);
    await w.pack(JSON.parse(w.read(p.id, "content-plan.json")), p.id);
    assert.equal(w.get(p.id).posters.length, 1);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
