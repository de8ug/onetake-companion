const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");
const home = path.resolve(process.env.ONETAKE_COMPANION_HOME || path.join(os.homedir(), ".onetake-pro"));
let port;
async function running() {
  const tokenFile = path.join(home, "pairing-token");
  if (!fs.existsSync(tokenFile)) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/status`, { headers: { Authorization: `Bearer ${fs.readFileSync(tokenFile, "utf8").trim()}` }, signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const status = await response.json();
    if (!status.capabilities?.localMedia || !status.capabilities?.workspace || status.capabilities?.legacyWhiteboard !== false) throw new Error("端口上运行的是旧助手，请先关闭旧进程再启动工作台");
    return true;
  } catch (error) { if (error.message.includes("旧助手")) throw error; return false; }
}
async function main() {
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("请安装 Node.js 22 或更新版本");
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(home).isDirectory()) throw new Error("助手目录不能是链接");
  const config = path.join(home, "config.env");
  if (fs.existsSync(config)) {
    const stat = fs.lstatSync(config);
    if (!stat.isFile() || (process.platform !== "win32" && (stat.mode & 0o077))) throw new Error("config.env 必须为私有普通文件");
    process.loadEnvFile(config);
  }
  port = Number(process.env.ONETAKE_COMPANION_PORT || 3010);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("助手端口无效");
  if (!await running()) {
    try { require.resolve("fflate"); } catch { throw new Error("缺少 ZIP 依赖，请在工作台源码目录运行 npm ci"); }
    for (const tool of ["ffmpeg", "ffprobe"]) if (spawnSync(tool, ["-version"], { stdio: "ignore" }).status !== 0) throw new Error(`缺少 ${tool}；请自行安装。启动器不自动安装软件。`);
    const args = [];
    if (fs.existsSync(config)) {
      const stat = fs.lstatSync(config);
      if (!stat.isFile() || (process.platform !== "win32" && (stat.mode & 0o077))) throw new Error("config.env 必须为私有普通文件");
      args.push(`--env-file=${config}`);
    }
    args.push(path.join(__dirname, "src/server.cjs"));
    const log = path.join(home, "assistant.log");
    if (fs.existsSync(log) && !fs.lstatSync(log).isFile()) throw new Error("日志不能是链接");
    const fd = fs.openSync(log, "a", 0o600);
    fs.fchmodSync(fd, 0o600);
    const child = spawn(process.execPath, args, { cwd: __dirname, env: { ...process.env, ONETAKE_COMPANION_HOME: home, ONETAKE_COMPANION_PORT: String(port) }, detached: true, stdio: ["ignore", fd, fd], windowsHide: true });
    child.on("error", () => {}); child.unref(); fs.closeSync(fd);
    for (let i = 0; i < 40 && !await running(); i++) await new Promise(resolve => setTimeout(resolve, 250));
    if (!await running()) throw new Error("助手未启动，请检查端口或私有目录中的日志");
  }
  console.log(`OneTake 口播视频工作台已就绪：http://127.0.0.1:${port}；工程准备免费，网页剪辑需配对与 PRO。`);
  if (process.argv.includes("--check")) return;
  const address = `http://127.0.0.1:${port}`;
  const opener = process.platform === "darwin" ? ["open", [address]] : process.platform === "win32" ? ["rundll32.exe", ["url.dll,FileProtocolHandler", address]] : ["xdg-open", [address]];
  spawnSync(opener[0], opener[1], { stdio: "ignore" });
  const file = path.join(home, "pairing-token");
  if (process.platform === "darwin") {
    const result = spawnSync("osascript", ["-e", 'display dialog "独立本地助手已启动。复制配对码后，回到 OneTake 连接。" with title "OneTake Companion" buttons {"完成", "复制配对码"} default button "复制配对码"'], { encoding: "utf8" });
    if (result.stdout?.includes("复制配对码")) spawnSync("pbcopy", [], { input: fs.readFileSync(file) });
  } else if (process.platform === "win32") {
    spawnSync("clip", [], { input: fs.readFileSync(file) }); console.log("配对码已复制");
  } else console.log("配对码位于私有目录的 pairing-token 文件；请勿公开。");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
