const assert = require("node:assert/strict");
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { promisify } = require("node:util");
const { timeoutMs } = require("./quick-edit.cjs");

const run = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const close = server => new Promise(resolve => server.close(resolve));

test("fractional recording durations produce valid integer process timeouts", () => {
  const duration = 207.970333;
  const analysis = timeoutMs(duration, 3000, 2 * 60000, 30 * 60000);
  const render = timeoutMs(duration, 2500, 10 * 60000, 60 * 60000, 2 * 60000);
  assert.equal(analysis, 623911);
  assert.equal(render, 639926);
});

test("production-origin page reaches local analysis and cover render only through a paired PRO companion", { timeout: 180000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onetake-companion-edit-test-"));
  const home = path.join(dir, "home");
  const downloads = path.join(dir, "Downloads");
  await fs.mkdir(downloads);
  const input = path.join(dir, "input.mp4");
  const cover = path.join(dir, "cover.png");
  const output = path.join(dir, "output.mp4");
  const licenseServer = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ valid: req.headers.authorization === "Bearer test-license", tier: "PRO" }));
  });
  const reservation = http.createServer();
  await listen(licenseServer);
  await listen(reservation);
  const companionPort = reservation.address().port;
  await close(reservation);
  const child = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
    env: {
      ...process.env,
      ONETAKE_COMPANION_PORT: String(companionPort),
      ONETAKE_COMPANION_HOME: home,
      ONETAKE_DOWNLOADS_DIR: downloads,
      ONETAKE_PROJECTS_DIR: path.join(dir, "projects"),
      ONETAKE_ALLOWED_ORIGINS: "https://onetake.show,http://127.0.0.1:3001",
      ONETAKE_LICENSE_URL: `http://127.0.0.1:${licenseServer.address().port}/validate`,
    },
    stdio: "ignore",
  });
  try {
    let pairing = "";
    for (let attempt = 0; attempt < 100; attempt++) {
      pairing = await fs.readFile(path.join(home, "pairing-token"), "utf8").catch(() => "");
      if (pairing) break;
      await delay(100);
    }
    assert(pairing, "companion did not create its pairing code");
    const url = `http://127.0.0.1:${companionPort}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      ready = await fetch(`${url}/status`, { headers: { Authorization: `Bearer ${pairing}` } }).then(response => response.ok).catch(() => false);
      if (ready) break;
      await delay(100);
    }
    assert(ready, "companion did not start");

    const preflight = await fetch(`${url}/quick-edit/analyze-silence`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://onetake.show",
        "Access-Control-Request-Private-Network": "true",
        "Access-Control-Request-Headers": "authorization,content-type,x-onetake-license,x-onetake-video-type",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://onetake.show");
    assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");
    assert.match(preflight.headers.get("access-control-allow-headers"), /X-OneTake-Video-Type/);

    const denied = await fetch(`${url}/status`, { headers: { Origin: "https://untrusted.example", Authorization: `Bearer ${pairing}` } });
    assert.equal(denied.status, 403);
    const unpaired = await fetch(`${url}/status`, { headers: { Origin: "https://onetake.show" } });
    assert.equal(unpaired.status, 401);
    const noLicense = await fetch(`${url}/quick-edit/analyze-silence`, { method: "POST", headers: { Origin: "https://onetake.show", Authorization: `Bearer ${pairing}` } });
    assert.equal(noLicense.status, 403);
    const badLicense = await fetch(`${url}/quick-edit/analyze-silence`, { method: "POST", headers: { Origin: "https://onetake.show", Authorization: `Bearer ${pairing}`, "X-OneTake-License": "invalid" } });
    assert.equal(badLicense.status, 403);
    const whiteboardEntry = await fetch(`${url}/jobs`, {
      method: "POST",
      headers: { Origin: "https://onetake.show", Authorization: `Bearer ${pairing}`, "X-OneTake-License": "test-license", "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "短" }),
    });
    assert.equal(whiteboardEntry.status, 410);

    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x280:d=1.2", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.2", "-c:v", "libx264", "-c:a", "aac", "-shortest", "-y", input]);
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=yellow:s=160x280", "-frames:v", "1", "-y", cover]);
    const videoBytes = await fs.readFile(input);
    const coverBytes = await fs.readFile(cover);
    const filename = "合成测试_onetake_1790484033245.mp4";
    await fs.copyFile(input, path.join(downloads, filename));
    const headers = {
      Origin: "https://onetake.show",
      Authorization: `Bearer ${pairing}`,
      "X-OneTake-License": "test-license",
      "X-OneTake-Video-Type": "video/mp4",
    };
    const analysis = await fetch(`${url}/quick-edit/analyze-silence?noiseDb=-35&minDuration=2`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ filename, size: videoBytes.length }),
    });
    if (!analysis.ok) assert.fail(`analysis returned ${analysis.status}: ${await analysis.text()}`);
    const result = await analysis.json();
    assert.equal(result.width, 160);
    assert.equal(result.height, 280);
    assert.equal(result.hasAudio, true);
    assert.deepEqual(result.cuts, []);
    assert.equal(result.source, "downloads");
    assert.match(result.recordingId, /^[\da-f-]{36}$/);
    await assert.rejects(fs.stat(path.join(home, "videos", `${result.recordingId}.mp4`)));
    const missing = await fetch(`${url}/quick-edit/analyze-silence`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ filename, size: videoBytes.length + 1 }),
    });
    assert.equal(missing.status, 404);
    const uploaded = await fetch(`${url}/quick-edit/analyze-silence`, {
      method: "POST", headers: { ...headers, "Content-Type": "video/mp4" }, body: videoBytes,
    });
    assert.equal(uploaded.status, 200);
    const saved = await uploaded.json();
    assert.equal(saved.source, "assistant");
    assert.equal((await fs.stat(path.join(home, "videos", `${saved.recordingId}.mp4`))).size, videoBytes.length);

    const outputName = "AI都会写代码了_OneTake.show.mp4";
    const renderOptions = JSON.stringify({ cuts: [], hasAudio: true, recordingId: result.recordingId, outputName })
      .replace(/[\u007f-\uffff]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
    const rendered = await fetch(`${url}/quick-edit/render`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/octet-stream", "X-OneTake-Cover-Bytes": String(coverBytes.length), "X-OneTake-Render-Options": renderOptions },
      body: coverBytes,
    });
    assert.equal(rendered.status, 202);
    const { jobId } = await rendered.json();
    assert.match(jobId, /^[\da-f-]{36}$/);
    let status = "running";
    let exported = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      const progress = await fetch(`${url}/quick-edit/render/${jobId}`, { headers });
      assert.equal(progress.status, 200);
      const result = await progress.json();
      status = result.status;
      exported = result.exportFile;
      if (status === "failed") assert.fail(result.error);
      if (status === "done") break;
      await delay(100);
    }
    assert.equal(status, "done");
    assert.equal(exported.name, outputName);
    assert.equal(exported.path, path.join(downloads, exported.name));
    assert.equal((await fs.stat(exported.path)).size, exported.size);
    const file = await fetch(`${url}/quick-edit/render/${jobId}/file`, { headers });
    assert.equal(file.status, 200);
    await fs.writeFile(output, Buffer.from(await file.arrayBuffer()));
    const pixel = async time => {
      const { stdout } = await run("ffmpeg", ["-v", "error", "-ss", time, "-i", output, "-frames:v", "1", "-vf", "scale=1:1,format=rgb24", "-f", "rawvideo", "-"], { encoding: "buffer" });
      return stdout;
    };
    const first = await pixel("0.2");
    const later = await pixel("0.9");
    assert(first[0] > 170 && first[1] > 150 && first[2] < 70);
    assert(later[2] > 130 && later[0] < 90);
  } finally {
    child.kill();
    await close(licenseServer);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
