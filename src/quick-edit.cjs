const { execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { promisify } = require("node:util");

const run = promisify(execFile);
const COVER_SECONDS = 0.6;
const MAX_VIDEO_BYTES = 800 * 1024 * 1024;
const renderJobs = new Map();
const savedRecordings = new Map();
const hasActiveRender = () => [...renderJobs.values()].some(job => job.status === "running");
const round = value => Math.round(value * 10000) / 10000;
const timeoutMs = (duration, factor, minimum, maximum, extra = 0) =>
  Math.ceil(Math.min(maximum, Math.max(minimum, duration * factor + extra)));

class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function extensionFor(type) {
  if (type?.includes("webm")) return "webm";
  if (type?.includes("quicktime")) return "mov";
  return "mp4";
}

async function receive(req, target, limit = MAX_VIDEO_BYTES) {
  const handle = await fs.promises.open(target, "wx");
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new InputError("录像超过本地助手的 800 MB 限制", 413);
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
        offset += bytesWritten;
      }
    }
  } finally {
    await handle.close();
  }
  if (!size) throw new InputError("没有收到有效的视频文件");
  return size;
}

async function mediaInfo(file) {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-print_format", "json", "-show_entries",
    "format=duration:stream=codec_type,duration,width,height", file,
  ], { timeout: 90000, maxBuffer: 1024 * 1024 });
  const data = JSON.parse(stdout);
  const video = data.streams?.find(stream => stream.codec_type === "video");
  const audio = data.streams?.find(stream => stream.codec_type === "audio");
  const duration = Number(data.format?.duration || video?.duration || audio?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0)
    throw new InputError("无法读取录像画面或时长");
  return { duration, width: video.width || 1920, height: video.height || 1080, hasAudio: !!audio };
}

function parseSilences(log, duration, minDuration) {
  const cuts = [];
  let start = null;
  for (const line of log.split(/\r?\n/)) {
    const opening = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
    if (opening) { start = Math.max(0, Number(opening[1])); continue; }
    const closing = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/);
    if (!closing || start === null) continue;
    const sourceStart = Math.min(start, duration);
    const sourceEnd = Math.min(Math.max(Number(closing[1]), sourceStart), duration);
    start = null;
    if (sourceEnd - sourceStart < minDuration) continue;
    const cutStart = round(sourceStart + 0.15);
    const cutEnd = round(sourceEnd - 0.15);
    if (cutEnd - cutStart < 0.05) continue;
    cuts.push({ id: `silence-${cuts.length + 1}`, sourceStart: round(sourceStart), sourceEnd: round(sourceEnd), start: cutStart, end: cutEnd, enabled: true });
  }
  return cuts;
}

async function silenceCuts(file, duration, noiseDb, minDuration) {
  const timeout = timeoutMs(duration, 3000, 2 * 60000, 30 * 60000);
  const { stderr } = await run("ffmpeg", [
    "-hide_banner", "-i", file, "-vn", "-af",
    `silencedetect=noise=${noiseDb}dB:d=${minDuration}`, "-f", "null", "-",
  ], { timeout, maxBuffer: 16 * 1024 * 1024 });
  return parseSilences(stderr, duration, minDuration);
}

function keepRanges(duration, cuts) {
  const merged = [];
  for (const cut of cuts.filter(cut => cut.enabled)
    .map(cut => ({ start: Math.max(0, Math.min(cut.start, duration)), end: Math.max(0, Math.min(cut.end, duration)) }))
    .filter(cut => cut.end - cut.start >= 0.05)
    .sort((a, b) => a.start - b.start)) {
    const previous = merged[merged.length - 1];
    if (previous && cut.start <= previous.end) previous.end = Math.max(previous.end, cut.end);
    else merged.push({ ...cut });
  }
  const keep = [];
  let cursor = 0;
  for (const cut of merged) {
    if (cut.start - cursor >= 0.05) keep.push({ start: round(cursor), end: round(cut.start) });
    cursor = Math.max(cursor, cut.end);
  }
  if (duration - cursor >= 0.05) keep.push({ start: round(cursor), end: round(duration) });
  return keep;
}

function renderCuts(value) {
  if (!value) return [];
  let request;
  try { request = JSON.parse(value); } catch { throw new InputError("剪辑参数无效"); }
  if (!Array.isArray(request.cuts) || request.cuts.length > 100)
    throw new InputError("剪辑点无效或过多");
  return request.cuts.map(cut => {
    if (typeof cut.start !== "number" || typeof cut.end !== "number" ||
        !Number.isFinite(cut.start) || !Number.isFinite(cut.end))
      throw new InputError("剪辑时间无效");
    return { start: cut.start, end: cut.end, enabled: cut.enabled === true };
  });
}

async function renderVideo({ input, cover, output, metadata, cuts }) {
  const { duration, width, height, hasAudio } = metadata;
  const ranges = keepRanges(duration, cuts);
  if (!ranges.length) throw new InputError("当前选择会删除整段视频，请至少保留一个片段");
  const w = Math.max(2, Math.floor(width / 2) * 2);
  const h = Math.max(2, Math.floor(height / 2) * 2);
  const filters = [`[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30,format=yuv420p,trim=duration=${COVER_SECONDS},setpts=PTS-STARTPTS[cv]`];
  if (hasAudio) filters.push(`anullsrc=channel_layout=mono:sample_rate=48000,atrim=duration=${COVER_SECONDS},asetpts=PTS-STARTPTS[ca]`);
  ranges.forEach((range, index) => {
    filters.push(`[0:v]trim=start=${range.start}:end=${range.end},setpts=PTS-STARTPTS,fps=30,scale=${w}:${h},format=yuv420p[v${index}]`);
    if (hasAudio) filters.push(`[0:a:0]atrim=start=${range.start}:end=${range.end},asetpts=PTS-STARTPTS[a${index}]`);
  });
  const inputs = [hasAudio ? "[cv][ca]" : "[cv]", ...ranges.map((_, index) => hasAudio ? `[v${index}][a${index}]` : `[v${index}]`)].join("");
  filters.push(`${inputs}concat=n=${ranges.length + 1}:v=1:a=${hasAudio ? 1 : 0}[outv]${hasAudio ? "[outa]" : ""}`);
  const args = ["-hide_banner", "-nostats", "-y", "-i", input,
    "-loop", "1", "-framerate", "30", "-t", String(COVER_SECONDS), "-i", cover,
    "-filter_complex", filters.join(";"), "-map", "[outv]",
    ...(hasAudio ? ["-map", "[outa]"] : []), "-c:v", "libx264", "-preset", "ultrafast",
    "-crf", "20", "-pix_fmt", "yuv420p", ...(hasAudio ? ["-c:a", "aac", "-b:a", "160k"] : []),
    "-movflags", "+faststart", output];
  const timeout = timeoutMs(duration, 2500, 10 * 60000, 60 * 60000, 2 * 60000);
  await run("ffmpeg", args, { timeout, maxBuffer: 32 * 1024 * 1024 });
}

function boundedNumber(value, fallback, min, max) {
  if (value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

async function saveExport(source, requestedName) {
  const downloads = process.env.ONETAKE_DOWNLOADS_DIR || path.join(os.homedir(), "Downloads");
  await fs.promises.mkdir(downloads, { recursive: true });
  const safeName = String(requestedName || "OneTake.show.mp4")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .slice(0, 120)
    .replace(/\.mp4$/i, "");
  for (let index = 0; index < 1000; index++) {
    const name = `${safeName || "OneTake.show"}${index ? `-${index + 1}` : ""}.mp4`;
    const target = path.join(downloads, name);
    try {
      await fs.promises.copyFile(source, target, fs.constants.COPYFILE_EXCL);
      return { path: target, name, size: (await fs.promises.stat(target)).size };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error("下载目录中同名成片过多，请整理后重试");
}

async function handleQuickEdit(req, res, url, reply, home) {
  const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "onetake-companion-edit-"));
  let retained = false;
  try {
    const type = req.headers["x-onetake-video-type"] || req.headers["content-type"];
    const input = path.join(temp, `${randomUUID()}.${extensionFor(type)}`);
    if (url.pathname === "/quick-edit/analyze-silence") {
      let sourceFile = input;
      let sourceSize = 0;
      if (req.headers["content-type"]?.startsWith("application/json")) {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
          if (Buffer.concat(chunks).length > 1024) throw new InputError("本地录像信息过长");
        }
        const hint = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (typeof hint.filename !== "string" || !/^(?:onetake_recording|[^/\\\x00-\x1f]{1,160}_onetake)_\d{10,16}\.(mp4|webm|mov)$/.test(hint.filename) ||
            !Number.isSafeInteger(hint.size) || hint.size < 100 || hint.size > MAX_VIDEO_BYTES)
          throw new InputError("本地录像文件名或大小无效");
        sourceFile = path.join(process.env.ONETAKE_DOWNLOADS_DIR || path.join(os.homedir(), "Downloads"), hint.filename);
        const stat = await fs.promises.lstat(sourceFile).catch(() => null);
        if (!stat?.isFile() || stat.size !== hint.size)
          throw new InputError("默认下载目录中没有找到对应原片", 404);
        sourceSize = stat.size;
      } else {
        sourceSize = await receive(req, input);
      }
      const metadata = await mediaInfo(sourceFile);
      const minDuration = boundedNumber(url.searchParams.get("minDuration"), 2, 0.5, 10);
      const noiseDb = boundedNumber(url.searchParams.get("noiseDb"), -35, -80, -10);
      const cuts = metadata.hasAudio ? await silenceCuts(sourceFile, metadata.duration, noiseDb, minDuration) : [];
      const recordingId = randomUUID();
      if (sourceFile === input) {
        const videoDir = path.join(home, "videos");
        await fs.promises.mkdir(videoDir, { recursive: true, mode: 0o700 });
        if (!(await fs.promises.lstat(videoDir)).isDirectory()) throw new InputError("原片目录必须是本机普通目录");
        await fs.promises.rename(input, path.join(videoDir, `${recordingId}.${extensionFor(type)}`));
      } else {
        savedRecordings.set(recordingId, { file: sourceFile, size: sourceSize });
      }
      return reply(200, { success: true, ...metadata, cuts, recordingId, source: sourceFile === input ? "assistant" : "downloads" });
    }
    if (url.pathname !== "/quick-edit/render") return reply(404, { message: "Not found" });
    const coverBytes = Number(req.headers["x-onetake-cover-bytes"]);
    if (!Number.isInteger(coverBytes) || coverBytes < 100 || coverBytes > 8 * 1024 * 1024)
      throw new InputError("封面图无效，请重新确认后导出");
    const cuts = renderCuts(req.headers["x-onetake-render-options"]);
    const options = JSON.parse(req.headers["x-onetake-render-options"] || "{}");
    const recordingId = options.recordingId;
    let savedInput = "";
    if (recordingId !== undefined) {
      if (typeof recordingId !== "string" || !/^[\da-f-]{36}$/.test(recordingId))
        throw new InputError("本地录像编号无效，请重新分析原片");
      const direct = savedRecordings.get(recordingId);
      if (direct) {
        const stat = await fs.promises.lstat(direct.file).catch(() => null);
        if (stat?.isFile() && stat.size === direct.size) savedInput = direct.file;
      } else {
        const videoDir = path.join(home, "videos");
        const candidates = ["mp4", "mov", "webm"].map(ext => path.join(videoDir, `${recordingId}.${ext}`));
        for (const file of candidates) {
          const stat = await fs.promises.lstat(file).catch(() => null);
          if (stat?.isFile() && stat.size > 0 && stat.size <= MAX_VIDEO_BYTES) { savedInput = file; break; }
        }
      }
      if (!savedInput) throw new InputError("助手中的原片副本不存在，请重新分析原片");
    }
    const combined = path.join(temp, "upload.bin");
    const total = await receive(req, combined, savedInput ? 8 * 1024 * 1024 : MAX_VIDEO_BYTES);
    if (savedInput ? coverBytes !== total : coverBytes >= total)
      throw new InputError("封面或视频文件不完整");
    const cover = path.join(temp, "cover.png");
    const handle = await fs.promises.open(combined, "r");
    const coverData = Buffer.alloc(coverBytes);
    try {
      let offset = 0;
      while (offset < coverBytes) {
        const { bytesRead } = await handle.read(coverData, offset, coverBytes - offset, offset);
        if (!bytesRead) throw new InputError("封面图不完整");
        offset += bytesRead;
      }
    } finally { await handle.close(); }
    if (!coverData.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new InputError("封面必须是 PNG 图片");
    await fs.promises.writeFile(cover, coverData);
    if (!savedInput) await pipeline(fs.createReadStream(combined, { start: coverBytes }), fs.createWriteStream(input));
    const renderInput = savedInput || input;
    const metadata = await mediaInfo(renderInput);
    const output = path.join(temp, "output.mp4");
    const id = randomUUID();
    const job = { status: "running", temp, output, error: "", exportFile: null };
    renderJobs.set(id, job);
    retained = true;
    const cleanup = setTimeout(() => {
      renderJobs.delete(id);
      void fs.promises.rm(temp, { recursive: true, force: true });
    }, 60 * 60000);
    cleanup.unref();
    reply(202, { jobId: id });
    void renderVideo({ input: renderInput, cover, output, metadata, cuts }).then(async () => {
      job.exportFile = await saveExport(output, options.outputName);
      job.status = "done";
    }).catch(error => {
      console.error("[companion quick-edit] render failed:", error);
      job.status = "failed";
      job.error = error instanceof InputError ? error.message : "本机剪辑失败，请重试；原片不会受影响";
    });
  } catch (error) {
    if (!res.headersSent && !res.destroyed) {
      if (error instanceof InputError) reply(error.status, { message: error.message });
      else {
        console.error("[companion quick-edit] failed:", error);
        reply(500, { message: "本机剪辑失败，请重试；原片不会受影响" });
      }
    }
  } finally {
    if (!retained) await fs.promises.rm(temp, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleQuickEditJob(req, res, url, reply) {
  const match = url.pathname.match(/^\/quick-edit\/render\/([\da-f-]{36})(?:\/(?:file|open-folder))?$/);
  if (!match) return false;
  const job = renderJobs.get(match[1]);
  if (!job) return reply(404, { message: "导出任务已过期，请重新导出" }), true;
  if (url.pathname.endsWith("/file")) {
    if (req.method !== "GET" || job.status !== "done") return reply(409, { message: "视频尚未生成" }), true;
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": (await fs.promises.stat(job.output)).size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    await pipeline(fs.createReadStream(job.output), res);
    return true;
  }
  if (url.pathname.endsWith("/open-folder")) {
    if (req.method !== "POST" || job.status !== "done" || !job.exportFile)
      return reply(409, { message: "成片尚未生成" }), true;
    const folder = path.dirname(job.exportFile.path);
    const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open";
    await run(command, [folder], { timeout: 10000 });
    return reply(200, { ok: true }), true;
  }
  if (req.method !== "GET") return reply(405, { message: "Method not allowed" }), true;
  reply(200, { status: job.status, error: job.error, exportFile: job.status === "done" ? job.exportFile : null });
  return true;
}

module.exports = { handleQuickEdit, handleQuickEditJob, hasActiveRender, timeoutMs, mediaInfo, silenceCuts, renderVideo, saveExport };
