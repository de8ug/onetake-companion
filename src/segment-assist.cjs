const textProvider = require("./text-provider.cjs");

function segmentText(part) {
  if (!part || typeof part.text !== "string" || !part.text.trim()) throw new Error("请先填写这一段口播词");
  return part.text.slice(0, 4000);
}

function modelObject(result) {
  const raw = result.data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || raw.length > 6000) throw new Error("模型未返回可编辑内容");
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim().replace(/^```(?:json)?\s*([\s\S]*?)```$/i, "$1");
  const value = JSON.parse(clean);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("模型返回格式无效");
  return value;
}

async function suggestQuote(part, provider, generate = textProvider.generate) {
  const script = segmentText(part);
  const result = await generate(provider, [
    { role: "system", content: "从口播内容提炼一句观众看得懂的短句，不编造事实，不加入稿中没有的结论。只返回 JSON：{\"quote\":\"\",\"emphasis\":\"\"}。quote不超过120字，emphasis是quote中完整且不超过40字的词。" },
    { role: "user", content: script },
  ]);
  const value = modelObject(result);
  if (typeof value.quote !== "string" || !value.quote.trim() || value.quote.length > 120 ||
      typeof value.emphasis !== "string" || value.emphasis.length > 40 ||
      value.emphasis && !value.quote.includes(value.emphasis)) throw new Error("金句格式不适合当前工程，请手动修改");
  return { quote: value.quote.trim(), emphasis: value.emphasis.trim() };
}

async function suggestImagePrompt(part, provider, generate = textProvider.generate) {
  const script = segmentText(part);
  const result = await generate(provider, [
    { role: "system", content: "为真人口播的一段话设计一张辅助理解的示意图，不是事实证明。不得虚构真实项目截图、品牌界面、真实人物或儿童肖像。只返回 JSON：{\"prompt\":\"\"}。画面提示词具体，适合清晰摄影或简洁图解，不要生成文字，长度不超过500字。" },
    { role: "user", content: JSON.stringify({ script, shot: part.shot || "" }) },
  ]);
  const value = modelObject(result);
  if (typeof value.prompt !== "string" || !value.prompt.trim() || value.prompt.length > 500) throw new Error("图片提示词无效，请手动填写");
  return { prompt: value.prompt.trim() };
}

async function generateMiniMaxImage(prompt, aspectRatio = "16:9", fetcher = fetch, env = process.env) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 1500) throw new Error("图片提示词需为 1 至 1500 字");
  if (!["16:9", "9:16"].includes(aspectRatio)) throw new Error("图片比例无效");
  const key = textProvider.config("minimax", env).apiKey;
  if (!key) throw new Error("请先配置 MiniMax Key 才能生成图片");
  const response = await fetcher("https://api.minimaxi.com/v1/image_generation", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "image-01", prompt: prompt.trim(), aspect_ratio: aspectRatio, n: 1, response_format: "base64", prompt_optimizer: false }),
    signal: AbortSignal.timeout(120000),
  });
  const raw = await response.text();
  if (raw.length > 6_000_000) throw new Error("图片响应过大，未保存");
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("图片服务返回格式无效"); }
  if (!response.ok || data.base_resp?.status_code !== 0) throw new Error("MiniMax 图片生成失败，请检查模型权限或余额");
  const encoded = data.data?.image_base64?.[0];
  if (typeof encoded !== "string" || !/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 4_000_000) throw new Error("图片数据无效或过大，未保存");
  const bytes = Buffer.from(encoded, "base64");
  const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png" :
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg" : null;
  if (!mime || bytes.length < 100 || bytes.length > 3_000_000) throw new Error("图片格式或大小不适合工程，未保存");
  return { bytes, mime, prompt: prompt.trim() };
}

module.exports = { suggestQuote, suggestImagePrompt, generateMiniMaxImage };
