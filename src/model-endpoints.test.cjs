const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const close = server => new Promise(resolve => server.close(resolve));

test("local model settings require trusted origin, pairing and PRO, and never echo keys", { timeout: 30000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onetake-model-endpoint-"));
  const home = path.join(dir, "home");
  const license = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ valid: req.headers.authorization === "Bearer pro-token", tier: "PRO" }));
  });
  const reservation = http.createServer();
  await listen(license);
  await listen(reservation);
  const port = reservation.address().port;
  await close(reservation);
  const child = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
    env: {
      ...process.env,
      ONETAKE_COMPANION_PORT: String(port),
      ONETAKE_COMPANION_HOME: home,
      ONETAKE_PROJECTS_DIR: path.join(dir, "projects"),
      ONETAKE_ALLOWED_ORIGINS: "https://onetake.show",
      ONETAKE_LICENSE_URL: `http://127.0.0.1:${license.address().port}/validate`,
    },
    stdio: "ignore",
  });
  try {
    let pairing = "";
    for (let attempt = 0; attempt < 100; attempt++) {
      pairing = await fs.readFile(path.join(home, "pairing-token"), "utf8").catch(() => "");
      if (pairing) break;
      await delay(50);
    }
    assert(pairing, "companion did not start");
    const url = `http://127.0.0.1:${port}`;
    const request = (headers, body = { provider: "minimax", key: "synthetic-test-key" }) =>
      fetch(`${url}/model-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    const origin = "https://onetake.show";
    assert.equal((await request({ Origin: "https://untrusted.example", Authorization: `Bearer ${pairing}`, "X-OneTake-License": "pro-token" })).status, 403);
    assert.equal((await request({ Origin: origin, "X-OneTake-License": "pro-token" })).status, 401);
    assert.equal((await request({ Origin: origin, Authorization: `Bearer ${pairing}` })).status, 403);
    assert.equal((await request({ Origin: origin, Authorization: `Bearer ${pairing}`, "X-OneTake-License": "invalid" })).status, 403);
    const allowed = await request({ Origin: origin, Authorization: `Bearer ${pairing}`, "X-OneTake-License": "pro-token" });
    assert.equal(allowed.status, 200);
    assert.ok(!(await allowed.text()).includes("synthetic-test-key"));
    const saved = path.join(home, "model-settings.json");
    assert.equal((await fs.stat(saved)).mode & 0o777, 0o600);
    const status = await fetch(`${url}/status`, { headers: { Origin: origin, Authorization: `Bearer ${pairing}` } });
    const statusText = await status.text();
    assert.ok(!statusText.includes("synthetic-test-key"));
    assert.ok(statusText.includes('"configured":true'));
  } finally {
    child.kill();
    await close(license);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
