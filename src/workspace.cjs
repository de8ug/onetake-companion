const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { validatePlan } = require("./project-generation.cjs");
const { zipSync } = require("fflate");
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
      await run(process.execPath, [path.join(__dirname, "build-project.cjs"), input, pending, path.join(folder, "assets")], { timeout: 15000, maxBuffer: 1024 * 1024 });
      for (const name of ["project.onetake.json", "content-plan.json", "录制稿与分镜.md", "图文发布词.md", "发布词.md", "来源与核验.md", "preview.html"]) {
        fs.renameSync(path.join(pending, name), path.join(folder, name));
      }
      const manifest = get(id);
      Object.assign(manifest, { title: plan.title, mode: plan.mode, updatedAt: Date.now(), state: "draft", publication: plan.publication, imagePublication: plan.imagePublication, coverTitle: plan.coverTitle, coverSubtitle: plan.coverSubtitle });
      save(manifest); return manifest;
    } finally { fs.rmSync(pending, { recursive: true, force: true }); }
  }
  async function create(plan) {
    plan = validatePlan(plan); const id = crypto.randomUUID();
    const folder = ordinaryDirectory(path.join(root, `${new Date().toISOString().slice(0, 10)}-${slug(plan.title)}--${id}`));
    for (const name of ["assets", "originals", "exports"]) ordinaryDirectory(path.join(folder, name));
    writeJson(path.join(folder, "manifest.json"), { id, title: plan.title, mode: plan.mode, createdAt: Date.now(), updatedAt: Date.now(), state: "preparing", recordings: [], exports: [], posters: [] });
    try { return await pack(plan, id); }
    catch (error) { const manifest = get(id); manifest.state = "failed"; save(manifest); throw error; }
  }
  function read(id, name) {
    if (!["project.onetake.json", "content-plan.json", "发布词.md", "图文发布词.md", "录制稿与分镜.md", "来源与核验.md", "publishing-bundle.zip"].includes(name)) throw new Error("文件不可访问");
    const file = path.join(dir(id), name); if (!fs.lstatSync(file).isFile()) throw new Error("文件无效");
    return fs.readFileSync(file);
  }
  function imagePart(plan, partId) {
    const part = plan.mode === "talkinghead" && plan.segments?.find(item => item.id === partId);
    if (!part) throw new Error("只支持为口播工程现有段落添加图片");
    return part;
  }
  async function attachImage(id, partId, prompt, image) {
    const plan = JSON.parse(read(id, "content-plan.json"));
    const part = imagePart(plan, partId);
    if (!image || !Buffer.isBuffer(image.bytes) || !["image/png", "image/jpeg"].includes(image.mime) || image.bytes.length < 100 || image.bytes.length > 3_000_000) throw new Error("图片数据无效");
    const isPng = image.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = image.bytes[0] === 0xff && image.bytes[1] === 0xd8 && image.bytes[2] === 0xff;
    if (image.mime === "image/png" ? !isPng : !isJpeg) throw new Error("图片内容与格式不符");
    const filename = `${crypto.randomUUID()}.${image.mime === "image/png" ? "png" : "jpg"}`;
    const file = path.join(dir(id), "assets", filename);
    const previous = part.image?.filename;
    fs.writeFileSync(file, image.bytes, { flag: "wx", mode: 0o600 });
    try { part.image = { filename, prompt }; part.imagePrompt = prompt; await pack(plan, id); }
    catch (error) { fs.rmSync(file, { force: true }); throw error; }
    if (previous && /^[a-f0-9-]{36}\.(png|jpg)$/.test(previous)) fs.rmSync(path.join(dir(id), "assets", previous), { force: true });
    return { filename, project: get(id) };
  }
  async function removeImage(id, partId) {
    const plan = JSON.parse(read(id, "content-plan.json"));
    const part = imagePart(plan, partId);
    if (!part.image) throw new Error("这段没有图片");
    const filename = part.image.filename;
    delete part.image;
    await pack(plan, id);
    fs.rmSync(path.join(dir(id), "assets", filename), { force: true });
    return get(id);
  }
  function image(id, filename) {
    if (!/^[a-f0-9-]{36}\.(png|jpg)$/.test(filename)) throw new Error("图片编号无效");
    const plan = JSON.parse(read(id, "content-plan.json"));
    if (!plan.segments?.some(part => part.image?.filename === filename)) throw new Error("图片未关联此工程");
    const file = path.join(dir(id), "assets", filename);
    if (!fs.lstatSync(file).isFile()) throw new Error("图片文件无效");
    return { bytes: fs.readFileSync(file), mime: filename.endsWith(".png") ? "image/png" : "image/jpeg" };
  }
  function trash(id) {
    const manifest = get(id), folder = dir(id);
    const bin = ordinaryDirectory(path.join(root, ".trash"));
    fs.renameSync(folder, path.join(bin, `${Date.now()}-${path.basename(folder)}`));
    for (const [key, ticket] of tickets) if (ticket.id === id) tickets.delete(key);
    return { id: manifest.id, title: manifest.title, trashDirectory: bin };
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
  function addPoster(id, page, bytes) {
    const manifest = get(id);
    const scenes = JSON.parse(read(id, "project.onetake.json")).scenes;
    if (manifest.mode !== "whiteboard" || !Number.isSafeInteger(page) || page < 0 || page >= scenes.length) throw new Error("白板页编号无效");
    if (!Buffer.isBuffer(bytes) || bytes.length < 100 || bytes.length > 8_000_000 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("白板图片无效");
    const filename = `page-${String(page + 1).padStart(2, "0")}.png`;
    const folder = ordinaryDirectory(path.join(dir(id), "assets", "posters"));
    if (fs.existsSync(path.join(folder, filename)) && !fs.lstatSync(path.join(folder, filename)).isFile()) throw new Error("白板图片位置无效");
    const temp = path.join(folder, `${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(temp, bytes, { mode: 0o600, flag: "wx" });
    try { fs.renameSync(temp, path.join(folder, filename)); } catch (error) { fs.rmSync(temp, { force: true }); throw error; }
    manifest.posters = (manifest.posters || []).filter(item => item.page !== page);
    manifest.posters.push({ page, sceneId: scenes[page].id, filename });
    manifest.posters.sort((a, b) => a.page - b.page);
    manifest.updatedAt = Date.now(); save(manifest);
    return { page, filename };
  }
  function bundle(id) {
    const manifest = get(id), folder = dir(id);
    const files = Object.create(null);
    let total = 0;
    const include = (name, file) => {
      if (!fs.lstatSync(file).isFile()) throw new Error("发布包文件不是普通文件");
      const stat = fs.statSync(file);
      total += stat.size;
      if (total > 160_000_000) throw new Error("发布包过大，请从工程目录单独取用成片");
      files[name] = new Uint8Array(fs.readFileSync(file));
    };
    for (const [name, source] of [
      ["project.onetake.json", "project.onetake.json"], ["content-plan.json", "content-plan.json"],
      ["recording-script.md", "录制稿与分镜.md"], ["video-publication.md", "发布词.md"],
      ["image-publication.md", "图文发布词.md"], ["sources-and-review.md", "来源与核验.md"],
    ]) include(name, path.join(folder, source));
    const plan = JSON.parse(read(id, "content-plan.json"));
    for (const part of plan.segments || []) if (part.image) include(`assets/${part.image.filename}`, path.join(folder, "assets", part.image.filename));
    for (const item of manifest.posters || []) {
      if (!Number.isSafeInteger(item.page) || item.filename !== `page-${String(item.page + 1).padStart(2, "0")}.png`) throw new Error("白板页索引无效");
      include(`posters/${item.filename}`, path.join(folder, "assets", "posters", item.filename));
    }
    for (const item of manifest.exports || []) {
      if (!/^[^/\\\x00-\x1f]{1,160}\.mp4$/.test(item.name) || !/^[^/\\\x00-\x1f]{1,170}\.png$/.test(item.coverName)) throw new Error("成片索引无效");
      include(`exports/${item.name}`, path.join(folder, "exports", item.name));
      include(`exports/${item.coverName}`, path.join(folder, "exports", item.coverName));
    }
    const zip = Buffer.from(zipSync(files, { level: 0 }));
    if (zip.length > 200_000_000) throw new Error("发布包过大，请从工程目录单独取用");
    const temp = path.join(folder, `${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(temp, zip, { mode: 0o600, flag: "wx" });
    try { fs.renameSync(temp, path.join(folder, "publishing-bundle.zip")); } catch (error) { fs.rmSync(temp, { force: true }); throw error; }
    return { filename: "publishing-bundle.zip", bytes: zip.length };
  }
  const exportDirectory = id => ordinaryDirectory(path.join(dir(id), "exports"));
  async function openFolder(id) {
    const folder = dir(id); await run(process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open", [folder], { timeout: 10000 });
  }
  return { root, downloads, list, get, dir, create, pack, read, image, attachImage, removeImage, addPoster, bundle, trash, handoff, consume, register, recording, importUploaded, findRecording, addExport, exportDirectory, openFolder };
}
module.exports = { createWorkspace, recordingName };
