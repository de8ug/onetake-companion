const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { seedPlan } = require("../src/project-generation.cjs");

// Exercise draft navigation without browser dependencies or real model/media access.
function editor(mode) {
  class Element {
    constructor() { this.children = []; this.value = ""; this.attributes = {}; this.classList = { toggle() {} }; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attributes[key] = value; }
    focus() { this.focused = true; }
  }
  const nodes = new Map();
  const get = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const context = vm.createContext({
    document: { getElementById: get, createElement: () => new Element(), createTextNode: text => text },
    fetch: async () => ({ ok: true, json: async () => ({ root: "/synthetic", projects: [] }) }),
    initialPlan: seedPlan(mode),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../ui/workbench.js"), "utf8"), context);
  vm.runInContext("showPlan(initialPlan, true)", context);
  return { get, run: source => vm.runInContext(source, context) };
}
for (const mode of ["whiteboard", "talkinghead"]) {
  test(`${mode}: tabs and single-part navigation retain unsaved drafts`, () => {
    const { get, run } = editor(mode);
    assert.equal(get("parts").children.length, 1);
    const row = get("parts").children[0];
    const spoken = row.children[2].children[1];
    spoken.value = "修改后的口播"; spoken.oninput();
    get("next-part").onclick();
    assert.equal(get("parts").children.length, 1);
    get("tab-publication").onclick();
    assert.equal(get("panel-script").hidden, true);
    assert.equal(get("panel-publication").hidden, false);
    get("description").value = "修改后的发布词"; get("description").oninput();
    get("tab-script").onclick(); get("previous-part").onclick();
    assert.equal(get("parts").children[0].children[2].children[1].value, "修改后的口播");
    assert.equal(run("plan.publication.description"), "修改后的发布词");
    assert.equal(get("unsaved").hidden, false);
    get("tab-script").onkeydown({ key: "End", preventDefault() {} });
    assert.equal(get("tab-json").attributes["aria-selected"], "true");
    assert.equal(get("tab-json").focused, true);
    assert.equal(get("panel-json").hidden, false);
  });
  test(`${mode}: adding and deleting a segment keeps navigation bounded`, async () => {
    const { get, run } = editor(mode);
    const length = run("parts().length");
    await get("add-part").onclick();
    assert.equal(run("activePart"), length);
    assert.equal(get("next-part").disabled, true);
    get("parts").children[0].children[0].children[0].onclick();
    assert.equal(run("parts().length"), length);
    assert.equal(run("activePart"), length - 1);
    assert.equal(get("parts").children.length, 1);
    assert.equal(get("next-part").disabled, true);
  });
}
