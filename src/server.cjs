const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { handleQuickEdit, handleQuickEditJob, hasActiveRender } = require("./quick-edit.cjs");
const { loadModelSettings, saveModelSettings } = require("./local-model-settings.cjs");
const textProvider = require("./text-provider.cjs");
const { generateScript, generateBroll } = require("./talkinghead-draft.cjs");
const { createWorkspace } = require("./workspace.cjs");
const { generatePlan, seedPlan } = require("./project-generation.cjs");

const VERSION = "0.3.0";
const DEFAULT_ORIGINS = "http://localhost:3001,http://127.0.0.1:3001,https://onetake.show,https://www.onetake.show";
const isDevelopment = origin => {
  if (!origin) return true;
  try { return ["localhost", "127.0.0.1"].includes(new URL(origin).hostname); }
  catch { return false; }
};

function createServer(options = {}) {
  const port = Number(options.port ?? process.env.ONETAKE_COMPANION_PORT ?? 3010);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("助手端口无效");
  const home = path.resolve(options.home || process.env.ONETAKE_COMPANION_HOME || path.join(os.homedir(), ".onetake-pro"));
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(home).isDirectory()) throw new Error("助手私有目录无效");
  loadModelSettings(home);
  const tokenFile = path.join(home, "pairing-token");
  if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, crypto.randomBytes(24).toString("hex"), { mode: 0o600, flag: "wx" });
  const stat = fs.lstatSync(tokenFile);
  if (!stat.isFile() || (process.platform !== "win32" && (stat.mode & 0o077))) throw new Error("配对文件须由当前用户私有保存，且不能是链接");
  const pairing = fs.readFileSync(tokenFile, "utf8").trim();
  if (!/^[a-f0-9]{48}$/.test(pairing)) throw new Error("配对文件无效，请备份后重新配对");
  const origins = new Set((options.origins || process.env.ONETAKE_ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map(x => x.trim()).filter(Boolean));
  let busy = false;
  let workspace;
  const library = () => workspace || (workspace = createWorkspace({ root: options.workspaceRoot, downloads: options.downloads }));
  const uiSession = crypto.randomBytes(32).toString("hex");
  const authorize = value => {
    if (typeof value !== "string") return false;
    const a = Buffer.from(value), b = Buffer.from(`Bearer ${pairing}`);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const server = http.createServer(async (req, res) => {
    const reply = (code, data) => {
      if (res.headersSent || res.destroyed || res.writableEnded) return;
      res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify(data));
    };
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return reply(403, { message: "Invalid host" });
    const origin = req.headers.origin;
    const ownOrigin = `http://${req.headers.host}`;
    if (origin && origin !== ownOrigin && !origins.has(origin)) return reply(403, { message: "Origin not paired" });
    if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-OneTake-License,X-OneTake-Video-Type,X-OneTake-Cover-Bytes,X-OneTake-Render-Options,X-OneTake-Import");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      if (origin && req.headers["access-control-request-private-network"] === "true") res.setHeader("Access-Control-Allow-Private-Network", "true");
      res.writeHead(204); return res.end();
    }
    const url = new URL(req.url, ownOrigin);
    if (req.method === "GET" && ["/", "/workbench.js", "/workbench.css"].includes(url.pathname)) {
      if (req.headers["sec-fetch-dest"] === "iframe") return reply(403, { message: "Embedding denied" });
      if (url.pathname === "/") res.setHeader("Set-Cookie", `onetake-workbench=${uiSession}; HttpOnly; SameSite=Strict; Path=/`);
      res.writeHead(200, { "Content-Type": url.pathname === "/" ? "text/html; charset=utf-8" : url.pathname.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'" });
      return res.end(fs.readFileSync(path.join(__dirname, "../ui", url.pathname === "/" ? "index.html" : url.pathname.slice(1))));
    }
    if (req.method === "GET" && url.pathname === "/workbench/import") {
      try { return reply(200, library().consume(req.headers["x-onetake-import"], origin)); }
      catch { return reply(403, { message: "导入凭证无效、来源不符或已过期，请从工作台重新打开" }); }
    }
    const cookie = req.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("onetake-workbench="))?.slice(18);
    const localUI = typeof cookie === "string" && cookie.length === uiSession.length && crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(uiSession)) && (!origin || origin === ownOrigin) && (!req.headers["sec-fetch-site"] || req.headers["sec-fetch-site"] === "same-origin");
    if (!authorize(req.headers.authorization) && !localUI) return reply(401, { message: "请输入本地助手配对码，或打开本地工作台" });
    if (localUI && req.method === "POST" && origin !== ownOrigin) return reply(403, { message: "Local UI origin required" });
    let acquired = false;
    try {
      if (req.method === "GET" && url.pathname === "/status") return reply(200, {
        version: VERSION, busy: busy || hasActiveRender(), quickEditAvailable: true,
        apiConfigured: textProvider.status().some(p => p.configured), textProviders: textProvider.status(),
        capabilities: { localMedia: true, personalKeyDrafting: true, projectGeneration: true, workspace: true, legacyWhiteboard: false },
        jobs: [], voiceConfigured: false, avatarConfigured: false,
      });
      if (await handleQuickEditJob(req, res, url, reply)) return;
      if (req.method === "GET" && url.pathname === "/workbench/projects") return reply(200, { projects: library().list(), root: library().root, downloads: library().downloads });
      const projectRoute = url.pathname.match(/^\/workbench\/projects\/([a-f0-9-]{36})(?:\/(plan|file|handoff|open-folder))?$/);
      if (projectRoute && req.method === "GET") {
        const id = projectRoute[1];
        if (projectRoute[2] === "plan") return reply(200, JSON.parse(library().read(id, "content-plan.json")));
        if (projectRoute[2] === "file") {
          const name = url.searchParams.get("name") || "project.onetake.json";
          const bytes = library().read(id, name);
          res.writeHead(200, { "Content-Type": name.endsWith(".json") ? "application/json" : "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); return res.end(bytes);
        }
        return reply(200, { ...library().get(id), directory: library().dir(id) });
      }
      if (url.pathname === "/jobs" || url.pathname.startsWith("/jobs/")) return reply(410, { message: "请用工作台或 Skill 生成工程；旧白板渲染实验不属于轻量工作台。原有项目文件未删除。" });
      const routes = ["/quick-edit/analyze-silence", "/quick-edit/render", "/model-settings", "/talkinghead/script", "/talkinghead/broll", "/workbench/projects", "/workbench/generate", "/workbench/seed", "/workbench/recordings/register"];
      if (req.method !== "POST" || !routes.includes(url.pathname) && !projectRoute) return reply(404, { message: "Not found" });
      if (busy || hasActiveRender()) return reply(409, { message: "已有任务运行，请等待" });
      if (url.pathname.startsWith("/quick-edit/")) {
      const license = req.headers["x-onetake-license"];
      if (typeof license !== "string" || !license.trim()) return reply(403, { message: "需要有效的 PRO 授权" });
      const licenseUrl = options.licenseUrl || process.env.ONETAKE_LICENSE_URL || (isDevelopment(origin) ? "http://127.0.0.1:3005/api/validate-session" : "");
      if (!licenseUrl) return reply(503, { message: "本地助手尚未配置线上授权地址 ONETAKE_LICENSE_URL" });
      const target = new URL(licenseUrl);
      if (target.username || target.password || (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname)))) return reply(503, { message: "授权地址必须使用 HTTPS；本机开发地址除外" });
      const validation = await (options.fetcher || fetch)(licenseUrl, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${license}` }, signal: AbortSignal.timeout(8000) });
      const valid = await validation.json();
      if (!validation.ok || valid.valid !== true || valid.tier !== "PRO") return reply(403, { message: "PRO 授权无效，请重新激活" });
      }
      if (busy || hasActiveRender()) return reply(409, { message: "已有任务运行，请等待" });
      busy = true; acquired = true;
      if (url.pathname.startsWith("/quick-edit/")) return await handleQuickEdit(req, res, url, reply, home, library);
      const chunks = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) return reply(413, { message: "输入过长" });
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { return reply(400, { message: "JSON 输入无效" }); }
      if (!input || typeof input !== "object" || Array.isArray(input)) return reply(400, { message: "输入格式无效" });
      if (url.pathname === "/workbench/seed") return reply(200, { plan: seedPlan(input.mode === "whiteboard" ? "whiteboard" : "talkinghead", input.topic || "把想法讲清楚", input.audience || "普通视频创作者", input.structure) });
      if (url.pathname === "/workbench/generate") {
        try { return reply(200, await generatePlan(input, options.generate || textProvider.generate)); }
        catch { return reply(422, { message: "模型调用或工程草稿校验失败；未保存工程，不会自动切换或计费重试。可改用手工模板。" }); }
      }
      if (url.pathname === "/workbench/projects") {
        try { return reply(201, await library().create(input.plan)); }
        catch { return reply(422, { message: "工程格式或打包失败，请检查段落、金句、图示和四个关键词；不能作为可用工程交付" }); }
      }
      if (url.pathname === "/workbench/recordings/register") {
        try { return reply(200, library().register(input.projectId, input.filename, input.size, localUI)); }
        catch { return reply(404, { message: "默认下载目录未找到对应原片，请保留原片，在 OneTake 粗剪时传入一次" }); }
      }
      if (projectRoute) {
        const id = projectRoute[1];
        if (projectRoute[2] === "handoff") return reply(200, library().handoff(id, input.target));
        if (projectRoute[2] === "open-folder") { await library().openFolder(id); return reply(200, { ok: true }); }
        try { return reply(200, await library().pack(input.plan, id)); }
        catch { return reply(422, { message: "修改内容未通过结构校验，原工程已保留" }); }
      }
      if (url.pathname === "/model-settings") {
        try { return reply(200, saveModelSettings(home, input.provider, input.key, input.model)); }
        catch { return reply(400, { message: "模型配置无效，请检查服务、Key 和私有文件权限" }); }
      }
      const result = url.pathname === "/talkinghead/script" ? await generateScript(input) : await generateBroll(input);
      return reply(200, result);
    } catch (error) {
      // Never echo upstream errors, submitted text, keys or private file paths.
      reply(error.name === "TimeoutError" ? 504 : 500, { message: error.name === "TimeoutError" ? "服务连接超时" : "请求处理失败，请检查本地配置或输入；不会自动切换模型" });
    } finally { if (acquired) busy = false; }
  });
  server.requestTimeout = 10 * 60 * 1000;
  server.headersTimeout = 30000;
  return { server, port, home };
}

function start() {
  const { server, port } = createServer();
  server.on("error", () => { console.error("助手无法启动，请检查端口与私有目录配置"); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log(`OneTake Companion ${VERSION}: http://127.0.0.1:${port}；配对码不自动输出`));
  return server;
}
if (require.main === module) { try { start(); } catch { console.error("助手配置无效，请检查私有目录、配对文件和端口"); process.exitCode = 1; } }
module.exports = { createServer, start };
