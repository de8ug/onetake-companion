const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");

test("runtime has no main-app imports, environment files or bundled Codex dependencies", () => {
  for (const file of [...fs.readdirSync(path.join(root, "src")).filter(f => !f.includes(".test.")), "../launcher.cjs", "../cli.cjs"]) {
    const text = fs.readFileSync(path.join(root, "src", file), "utf8");
    assert.doesNotMatch(text, /excalidraw|backend\/|codex-runtimes|node_modules|compose\.ts|engine\.cjs/);
    for (const match of text.matchAll(/require\(["']([^"']+)["']\)/g)) {
      assert(match[1].startsWith("node:") || match[1].startsWith("./") || match[1] === "fflate", `External import ${match[1]}`);
    }
  }
});

test("a copied directory can load the server and CLI without any parent repository", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "onetake-independent-"));
  try {
    const isolated = path.join(temp, "standalone");
    fs.cpSync(root, isolated, { recursive: true, filter: file => !file.includes(`${path.sep}.git`) });
    const loaded = spawnSync(process.execPath, ["-e", 'require("./src/server.cjs")'], { cwd: isolated, env: { PATH: process.env.PATH, HOME: temp }, encoding: "utf8" });
    assert.equal(loaded.status, 0, loaded.stderr);
    assert(!fs.existsSync(path.join(temp, ".onetake-pro")), "import must not create private state");
    const cli = spawnSync(process.execPath, ["cli.cjs", "--help"], { cwd: isolated, env: { PATH: process.env.PATH, HOME: temp }, encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /analyze/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
