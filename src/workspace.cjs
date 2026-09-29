const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { validatePlan } = require("./project-generation.cjs");
const run = promisify(execFile);
const ID = /^[a-f0-9-]{36}$/;
const recordingName = name => typeof name === "string" && /^(?:onetake_recording|[^/\\\x00-\x1f]{1,160}_onetake)_\d{10,16}\.(mp4|webm|mov)$/.test(name);
const slug = title => title.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 50).replace(/^\.+/, "_") || "工程";
function ordinaryDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(dir).isDirectory()) throw new Error("工作目录不能是链接");
  return dir;
}
function jsonFile(file) {
  if (!fs.lstatSync(file).isFile()) throw new Error("索引不能是链接");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, value) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
  try { fs.renameSync(temp, file); } catch (error) { fs.rmSync(temp, { force: true }); throw error; }
}
function createWorkspace(options = {}) {
  const root = path.resolve(options.root || process.env.ONETAKE_WORKSPACE_DIR || path.join(os.homedir(), "Documents", "OneTake视频工作台"));
  const downloads = path.resolve(options.downloads || process.env.ONETAKE_DOWNLOADS_DIR || path.join(os.homedir(), "Downloads"));
  ordinaryDirectory(root);
  const tickets = new Map();
  function dir(id) {
    if (!ID.test(id)) throw new Error("工程编号无效");
    const name = fs.readdirSync(root).find(n => n.endsWith(`--${id}`));
    if (!name) throw new Error("未找到工程");
    const folder = path.join(root, name);
    if (!fs.lstatSync(folder).isDirectory()) throw new Error("工程目录不能是链接");
    return folder;
  }
  const get = id => { const manifest = jsonFile(path.join(dir(id), "manifest.json")); if (manifest.id !== id) throw new Error("工程索引不匹配"); return manifest; };
  const save = manifest => writeJson(path.join(dir(manifest.id), "manifest.json"), manifest);
  const list = () => fs.readdirSync(root).filter(n => /--[a-f0-9-]{36}$/.test(n)).flatMap(n => {
    try { return [get(n.slice(-36))]; } catch { return []; }
  }).sort((a, b) => b.updatedAt - a.updatedAt);
  async function pack(plan, id) {
    plan = validatePlan(plan);
    const folder = dir(id), pending = fs.mkdtempSync(path.join(folder, ".build-"));
    try {
      const input = path.join(pending, "input.json"); writeJson(input, plan);
      await run(process.execPath, [path.join(__dirname, "build-project.cjs"), input, pending], { timeout: 15000, maxBuffer: 1024 * 1024 });
      for (const name of ["project.onetake.json", "content-plan.json", "录制稿与分镜.md", "发布词.md", "来源与核验.md", "preview.html"]) {
        fs.renameSync(path.join(pending, name), path.join(folder, name));
      }
      const manifest = get(id);
      Object.assign(manifest, { title: plan.title, mode: plan.mode, updatedAt: Date.now(), state: "draft", publication: plan.publication, coverTitle: plan.coverTitle, coverSubtitle: plan.coverSubtitle });
      save(manifest); return manifest;
    } finally { fs.rmSync(pending, { recursive: true, force: true }); }
  }
  async function create(plan) {
    plan = validatePlan(plan); const id = crypto.randomUUID();
    const folder = ordinaryDirectory(path.join(root, `${new Date().toISOString().slice(0, 10)}-${slug(plan.title)}--${id}`));
    for (const name of ["assets", "originals", "exports"]) ordinaryDirectory(path.join(folder, name));
    writeJson(path.join(folder, "manifest.json"), { id, title: plan.title, mode: plan.mode, createdAt: Date.now(), updatedAt: Date.now(), state: "preparing", recordings: [], exports: [] });
    try { return await pack(plan, id); }
    catch (error) { const manifest = get(id); manifest.state = "failed"; save(manifest); throw error; }
  }
  function read(id, name) {
    if (!["project.onetake.json", "content-plan.json", "发布词.md", "录制稿与分镜.md", "来源与核验.md"].includes(name)) throw new Error("文件不可访问");
    const file = path.join(dir(id), name); if (!fs.lstatSync(file).isFile()) throw new Error("文件无效");
    return fs.readFileSync(file);
  }
  function handoff(id, target) {
    get(id);
    const allowed = new Set(["http://127.0.0.1:3001", "http://localhost:3001", "https://onetake.show", "https://www.onetake.show"]);
    if (!allowed.has(target)) throw new Error("导入目标不受信任");
    const token = crypto.randomBytes(24).toString("hex");
    const now = Date.now();
    for (const [key, item] of tickets) if (item.until < now) tickets.delete(key);
    if (tickets.size >= 200) tickets.delete(tickets.keys().next().value);
    tickets.set(token, { id, origin: target, until: now + 10 * 60000 });
    return { url: `${target}/#onetake-import=${token}`, expiresInSeconds: 600, target };
  }
  function consume(token, origin) {
    const ticket = tickets.get(token);
    if (!ticket || ticket.origin !== origin || ticket.until < Date.now()) throw new Error("导入凭证无效或过期，请从工作台重新打开");
    const project = JSON.parse(read(ticket.id, "project.onetake.json"));
    tickets.delete(token);
    return { project, workspaceProjectId: ticket.id, publication: get(ticket.id).publication };
  }
  function register(id, filename, size, allowGeneric = false) {
    if (!(recordingName(filename) || allowGeneric && /^[^/\\\x00-\x1f]{1,180}\.(mp4|mov|webm)$/i.test(filename)) || !Number.isSafeInteger(size) || size < 100 || size > 800 * 1024 * 1024) throw new Error("原片名称或大小无效");
    const file = path.join(downloads, filename), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size !== size) throw new Error("默认下载目录未找到对应原片");
    return record(id, { kind: "downloads", filename, size, mtimeMs: stat.mtimeMs });
  }
  function record(id, entry) {
    const manifest = get(id);
    const existing = manifest.recordings.find(r => r.kind === entry.kind && r.filename === entry.filename && r.size === entry.size && r.mtimeMs === entry.mtimeMs);
    if (existing) return existing;
    const item = { ...entry, recordingId: crypto.randomUUID(), createdAt: Date.now() };
    manifest.recordings.push(item); manifest.updatedAt = Date.now(); save(manifest); return item;
  }
  function recording(id, recordingId) {
    const item = get(id).recordings.find(r => r.recordingId === recordingId);
    if (!item) throw new Error("原片索引不存在");
    const file = item.kind === "downloads" ? path.join(downloads, item.filename) : path.join(dir(id), "originals", item.storedName);
    if (path.basename(item.filename) !== item.filename || item.kind !== "downloads" && !/^[a-f0-9-]{36}\.(mp4|webm|mov)$/.test(item.storedName)) throw new Error("原片索引无效");
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size !== item.size || stat.mtimeMs !== item.mtimeMs) throw new Error("原片已移动或更改，请重新选择");
    return { ...item, file };
  }
  function importUploaded(id, input, filename, ext) {
    if (!["mp4", "webm", "mov"].includes(ext)) throw new Error("视频格式无效");
    const storedName = `${crypto.randomUUID()}.${ext}`, target = path.join(ordinaryDirectory(path.join(dir(id), "originals")), storedName);
    fs.renameSync(input, target); const stat = fs.statSync(target);
    return record(id, { kind: "workspace", filename: path.basename(filename || storedName), storedName, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  function findRecording(id, filename, size) {
    const item = get(id).recordings.find(r => r.filename === filename && r.size === size);
    if (!item) return null;
    try { return recording(id, item.recordingId); } catch { return null; }
  }
  function addExport(id, file, cover, jobId) {
    const folder = ordinaryDirectory(path.join(dir(id), "exports"));
    if (path.dirname(file.path) !== folder) throw new Error("成片位置无效");
    const coverName = `${path.basename(file.name, ".mp4")}_cover.png`;
    fs.copyFileSync(cover, path.join(folder, coverName), fs.constants.COPYFILE_EXCL);
    const manifest = get(id); manifest.exports.push({ ...file, coverName, jobId, createdAt: Date.now() }); manifest.updatedAt = Date.now(); save(manifest);
  }
  const exportDirectory = id => ordinaryDirectory(path.join(dir(id), "exports"));
  async function openFolder(id) {
    const folder = dir(id); await run(process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open", [folder], { timeout: 10000 });
  }
  return { root, downloads, list, get, dir, create, pack, read, handoff, consume, register, recording, importUploaded, findRecording, addExport, exportDirectory, openFolder };
}
module.exports = { createWorkspace, recordingName };
