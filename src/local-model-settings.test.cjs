const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadModelSettings, saveModelSettings } = require("./local-model-settings.cjs");

test("model keys remain in a private local file and never appear in responses", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "onetake-model-test-"));
  const previous = process.env.MINIMAX_API_KEY;
  try {
    const result = saveModelSettings(home, "minimax", "fake-minimax-key");
    const file = path.join(home, "model-settings.json");
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(result.configured, true);
    assert.ok(!JSON.stringify(result).includes("fake-minimax-key"));
    delete process.env.MINIMAX_API_KEY;
    loadModelSettings(home);
    assert.equal(process.env.MINIMAX_API_KEY, "fake-minimax-key");
    assert.throws(() => saveModelSettings(home, "other", "fake-key"));
    fs.chmodSync(file, 0o644);
    assert.throws(() => loadModelSettings(home), /权限过宽/);
  } finally {
    if (previous === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("model settings reject symbolic links rather than reading external secrets", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "onetake-link-test-"));
  try {
    const target = path.join(home, "external.json");
    fs.writeFileSync(target, "{}", { mode: 0o600 });
    fs.symlinkSync(target, path.join(home, "model-settings.json"));
    assert.throws(() => loadModelSettings(home), /链接/);
    assert.throws(() => saveModelSettings(home, "minimax", "synthetic-key"), /链接/);
    assert.equal(fs.readFileSync(target, "utf8"), "{}");
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
