const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createServer } = require("../src/server.cjs");
const { seedPlan } = require("../src/project-generation.cjs");
test("local UI is free, denies CSRF and exposes only origin-bound project tickets", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-http-"));
  const reserved = http.createServer(); await new Promise(r => reserved.listen(0, "127.0.0.1", r));
  const port = reserved.address().port; await new Promise(r => reserved.close(r));
  const { server } = createServer({ port, home: path.join(tmp, "home"), workspaceRoot: path.join(tmp, "projects"), generate: async () => ({ model: "mock", data: { choices: [{ message: { content: JSON.stringify(seedPlan("whiteboard")) } }] } }) });
  await new Promise(r => server.listen(port, "127.0.0.1", r));
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${base}/workbench/projects`)).status, 401);
    const page = await fetch(base); assert.equal(page.status, 200);
    assert.match(await page.text(), /OneTake 口播视频工作台/);
    const cookie = page.headers.get("set-cookie").split(";")[0];
    const post = (url, data, origin = base) => fetch(base + url, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(data) });
    assert.equal((await post("/workbench/seed", {}, "https://onetake.show")).status, 401);
    const draft = await (await post("/workbench/seed", { mode: "whiteboard" })).json();
    const project = await (await post("/workbench/projects", { plan: draft.plan })).json(); assert.match(project.id, /^[a-f0-9-]{36}$/);
    assert.equal((await post("/quick-edit/analyze-silence", {})).status, 403);
    const generated = await post("/workbench/generate", { mode: "whiteboard", provider: "minimax", topic: "表达", audience: "普通人" }); assert.equal(generated.status, 200);
    assert.equal((await post(`/workbench/projects/${project.id}/handoff`, { target: "https://evil.example" })).status, 500);
    const ticket = await (await post(`/workbench/projects/${project.id}/handoff`, { target: "http://127.0.0.1:3001" })).json();
    const token = ticket.url.split("=")[1];
    assert.equal((await fetch(`${base}/workbench/import`, { headers: { Origin: "https://onetake.show", "X-OneTake-Import": token } })).status, 403);
    const incoming = await fetch(`${base}/workbench/import`, { headers: { Origin: "http://127.0.0.1:3001", "X-OneTake-Import": token } });
    assert.equal(incoming.status, 200); const result = await incoming.json(); assert.equal(result.workspaceProjectId, project.id); assert.equal(result.project.scenes.length, 4);
    assert.doesNotMatch(JSON.stringify(result), /pairing-token|synthetic-test-key/);
    assert.equal((await fetch(`${base}/workbench/import`, { headers: { Origin: "http://127.0.0.1:3001", "X-OneTake-Import": token } })).status, 403);
  } finally { await new Promise(r => server.close(r)); fs.rmSync(tmp, { recursive: true, force: true }); }
});
