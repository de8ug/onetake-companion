const fs = require("node:fs");
const path = require("node:path");

const fields = {
  minimax: { key: "MINIMAX_API_KEY", model: "MINIMAX_MODEL" },
  glm: { key: "GLM_API_KEY", model: "GLM_MODEL" },
};

const settingsPath = home => path.join(home, "model-settings.json");

function privateFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error("本地模型配置必须是普通文件，不能是链接");
  if (process.platform !== "win32" && (stat.mode & 0o077))
    throw new Error("本地模型配置权限过宽，请改为仅当前用户可读写");
}

function loadModelSettings(home) {
  const file = settingsPath(home);
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file)) return;
  privateFile(file);
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [provider, names] of Object.entries(fields)) {
    const entry = saved[provider];
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.key === "string" && entry.key) process.env[names.key] = entry.key;
    if (typeof entry.model === "string" && entry.model) process.env[names.model] = entry.model;
  }
}

function saveModelSettings(home, provider, key, model) {
  if (!fields[provider]) throw new Error("不支持的模型服务");
  if (typeof key !== "string" || key.trim().length < 8 || key.length > 4096)
    throw new Error("请输入有效的 API Key");
  if (model !== undefined && (typeof model !== "string" || (model.trim() && !/^[a-zA-Z0-9_.-]{1,100}$/.test(model.trim()))))
    throw new Error("模型名称无效");
  const file = settingsPath(home);
  if (fs.existsSync(file)) privateFile(file);
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const selectedModel = model?.trim();
  saved[provider] = { key: key.trim(), ...(selectedModel ? { model: selectedModel } : {}) };
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(saved), { mode: 0o600, flag: "wx" });
  try { fs.renameSync(temporary, file); }
  catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  fs.chmodSync(file, 0o600);
  process.env[fields[provider].key] = key.trim();
  if (selectedModel) process.env[fields[provider].model] = selectedModel;
  return { provider, configured: true };
}

module.exports = { loadModelSettings, saveModelSettings };
