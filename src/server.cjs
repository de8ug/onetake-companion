const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { handleQuickEdit, handleQuickEditJob, hasActiveRender } = require("./quick-edit.cjs");
const { loadModelSettings, saveModelSettings } = require("./local-model-settings.cjs");
const textProvider = require("./text-provider.cjs");
const { generateScript, generateBroll } = require("./talkinghead-draft.cjs");

const VERSION = "0.2.0";
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
    if (origin && !origins.has(origin)) return reply(403, { message: "Origin not paired" });
    if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-OneTake-License,X-OneTake-Video-Type,X-OneTake-Cover-Bytes,X-OneTake-Render-Options");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      if (origin && req.headers["access-control-request-private-network"] === "true") res.setHeader("Access-Control-Allow-Private-Network", "true");
      res.writeHead(204); return res.end();
    }
    if (!authorize(req.headers.authorization)) return reply(401, { message: "请输入本地助手配对码" });
    let acquired = false;
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/status") return reply(200, {
        version: VERSION, busy: busy || hasActiveRender(), quickEditAvailable: true,
        apiConfigured: textProvider.status().some(p => p.configured), textProviders: textProvider.status(),
        capabilities: { localMedia: true, personalKeyDrafting: true, legacyWhiteboard: false },
        jobs: [], voiceConfigured: false, avatarConfigured: false,
      });
      if (await handleQuickEditJob(req, res, url, reply)) return;
      if (url.pathname === "/jobs" || url.pathname.startsWith("/jobs/")) return reply(410, { message: "完整工程请用 Skill 制作；旧白板渲染实验不属于轻量助手。原有项目文件未删除。" });
      const routes = ["/quick-edit/analyze-silence", "/quick-edit/render", "/model-settings", "/talkinghead/script", "/talkinghead/broll"];
      if (req.method !== "POST" || !routes.includes(url.pathname)) return reply(404, { message: "Not found" });
      if (busy || hasActiveRender()) return reply(409, { message: "已有任务运行，请等待" });
      const license = req.headers["x-onetake-license"];
      if (typeof license !== "string" || !license.trim()) return reply(403, { message: "需要有效的 PRO 授权" });
      const licenseUrl = options.licenseUrl || process.env.ONETAKE_LICENSE_URL || (isDevelopment(origin) ? "http://127.0.0.1:3005/api/validate-session" : "");
      if (!licenseUrl) return reply(503, { message: "本地助手尚未配置线上授权地址 ONETAKE_LICENSE_URL" });
      const target = new URL(licenseUrl);
      if (target.username || target.password || (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname)))) return reply(503, { message: "授权地址必须使用 HTTPS；本机开发地址除外" });
      const validation = await (options.fetcher || fetch)(licenseUrl, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${license}` }, signal: AbortSignal.timeout(8000) });
      const valid = await validation.json();
      if (!validation.ok || valid.valid !== true || valid.tier !== "PRO") return reply(403, { message: "PRO 授权无效，请重新激活" });
      if (busy || hasActiveRender()) return reply(409, { message: "已有任务运行，请等待" });
      busy = true; acquired = true;
      if (url.pathname.startsWith("/quick-edit/")) return await handleQuickEdit(req, res, url, reply, home);
      const chunks = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 65536) return reply(413, { message: "输入过长" });
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { return reply(400, { message: "JSON 输入无效" }); }
      if (!input || typeof input !== "object" || Array.isArray(input)) return reply(400, { message: "输入格式无效" });
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
