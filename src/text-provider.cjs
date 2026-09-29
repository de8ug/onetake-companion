const definitions = {
  glm: {
    label: "GLM",
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    key: "GLM_API_KEY",
    modelKey: "GLM_MODEL",
    model: "glm-5.3",
  },
  minimax: {
    label: "MiniMax",
    url: "https://api.minimaxi.com/v1/chat/completions",
    key: "MINIMAX_API_KEY",
    modelKey: "MINIMAX_MODEL",
    model: "MiniMax-M3",
  },
};
function config(name = "minimax", env = process.env) {
  const d = definitions[name];
  if (!d) throw new Error("不支持的文本服务");
  return {
    ...d,
    name,
    model: env[d.modelKey] || d.model,
    apiKey: env[d.key] || (name === "glm" ? env.ZHIPU_API_KEY : ""),
  };
}
function status(env = process.env) {
  return Object.keys(definitions).map((name) => {
    const c = config(name, env);
    return { id: name, label: c.label, model: c.model, configured: !!c.apiKey };
  });
}
async function generate(
  name,
  messages,
  signal,
  fetcher = fetch,
  env = process.env,
) {
  const c = config(name, env);
  if (!c.apiKey) throw new Error(`请在本地助手配置 ${c.key}`);
  const body = { model: c.model, messages, stream: false, temperature: 0.55 };
  if (name === "minimax") {
    body.max_completion_tokens = 16000;
    body.reasoning_split = true;
    if (c.model.startsWith("MiniMax-M3")) body.thinking = { type: "disabled" };
  } else {
    body.max_tokens = 24000;
    if (c.model.startsWith("glm-5.3")) {
      body.thinking = { type: "enabled" };
      body.reasoning_effort = "high";
    } else if (!c.model.startsWith("glm-4-flash"))
      body.thinking = { type: "disabled" };
  }
  const response = await fetcher(c.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([
      signal || new AbortController().signal,
      AbortSignal.timeout(300000),
    ]),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${c.label} 返回非 JSON 响应（HTTP ${response.status}）`);
  }
  if (!response.ok || data.error || data.base_resp?.status_code)
    throw new Error(
      `${c.label} 调用失败（HTTP ${response.status}，错误码 ${String(data.error?.code || data.base_resp?.status_code || "unknown").replace(/[^a-zA-Z0-9_-]/g, "").slice(0,32)}）；可手动选择备用模型重试`,
    );
  return { data, provider: name, model: c.model };
}
module.exports = { config, status, generate };
