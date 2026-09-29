const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
test("standalone CLI exports a cover without pairing and preserves its original", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onetake-cli-"));
  try {
    const video = path.join(dir, "video.mp4"), cover = path.join(dir, "cover.png"), options = path.join(dir, "options.json");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x280:d=1", "-c:v", "libx264", "-y", video]);
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=yellow:s=160x280", "-frames:v", "1", "-y", cover]);
    await fs.writeFile(options, JSON.stringify({ cuts: [], outputName: "test.mp4" }));
    const before = await fs.readFile(video);
    const cli = path.resolve(__dirname, "../cli.cjs");
    const env = { ...process.env, ONETAKE_DOWNLOADS_DIR: path.join(dir, "Downloads") };
    await run(process.execPath, [cli, "render", video, cover, options], { env });
    await run(process.execPath, [cli, "render", video, cover, options], { env });
    assert.deepEqual(await fs.readFile(video), before);
    assert.equal((await fs.readdir(env.ONETAKE_DOWNLOADS_DIR)).length, 2);
    const link = path.join(dir, "link.mp4"); await fs.symlink(video, link);
    await assert.rejects(run(process.execPath, [cli, "analyze", link], { env }));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("actual silent interval is detected and removed only after review", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onetake-silence-"));
  try {
    const video = path.join(dir, "video.mp4"), cover = path.join(dir, "cover.png"), options = path.join(dir, "options.json");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x280:d=5", "-f", "lavfi", "-i", "sine=frequency=440:duration=5", "-af", "volume=enable='between(t,1,4)':volume=0", "-c:v", "libx264", "-c:a", "aac", "-shortest", "-y", video]);
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=yellow:s=160x280", "-frames:v", "1", "-y", cover]);
    const cli = path.resolve(__dirname, "../cli.cjs");
    const env = { ...process.env, ONETAKE_DOWNLOADS_DIR: path.join(dir, "Downloads") };
    const analysis = JSON.parse((await run(process.execPath, [cli, "analyze", video], { env })).stdout);
    assert.equal(analysis.cuts.length, 1);
    const cuts = analysis.cuts.map(c => ({ ...c, enabled: true }));
    await fs.writeFile(options, JSON.stringify({ cuts, outputName: "reviewed.mp4" }));
    const result = JSON.parse((await run(process.execPath, [cli, "render", video, cover, options], { env })).stdout);
    const output = JSON.parse((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", result.path])).stdout);
    assert(Number(output.format.duration) < 4);
    assert(Number(output.format.duration) > 2);
    assert.equal((await fs.stat(video)).isFile(), true);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
