const test = require("node:test");
const assert = require("node:assert/strict");
const { suggestQuote, suggestImagePrompt, generateMiniMaxImage } = require("./segment-assist.cjs");

test("single-segment quote and image-prompt suggestions stay editable", async () => {
  const quote = await suggestQuote({ text: "用具体例子讲清问题。" }, "minimax", async () => ({ data: { choices: [{ message: { content: '{"quote":"先讲具体例子","emphasis":"具体例子"}' } }] } }));
  assert.deepEqual(quote, { quote: "先讲具体例子", emphasis: "具体例子" });
  const prompt = await suggestImagePrompt({ text: "按一下按钮分数就会变化。", shot: "点击按钮" }, "glm", async () => ({ data: { choices: [{ message: { content: '{"prompt":"桌面上的简单计分器示意图，无文字"}' } }] } }));
  assert.match(prompt.prompt, /计分器/);
  await assert.rejects(suggestQuote({ text: "有效口播" }, "minimax", async () => ({ data: { choices: [{ message: { content: '{"quote":"好","emphasis":"不在里面"}' } }] } })), /金句格式/);
});

test("MiniMax image generation accepts only bounded inline image bytes", async () => {
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(120)]);
  let call;
  const fetcher = async (url, options) => {
    call = { url, options };
    return { ok: true, text: async () => JSON.stringify({ base_resp: { status_code: 0 }, data: { image_base64: [png.toString("base64")] } }) };
  };
  const image = await generateMiniMaxImage("示意图", "16:9", fetcher, { MINIMAX_API_KEY: "synthetic-image-key" });
  assert.equal(image.mime, "image/png");
  assert.deepEqual(image.bytes, png);
  assert.equal(call.url, "https://api.minimaxi.com/v1/image_generation");
  assert.equal(JSON.parse(call.options.body).response_format, "base64");
  assert.ok(!JSON.stringify(image).includes("synthetic-image-key"));
  await assert.rejects(generateMiniMaxImage("示意图", "16:9", async () => ({ ok: true, text: async () => JSON.stringify({ base_resp: { status_code: 0 }, data: { image_base64: [Buffer.alloc(120).toString("base64")] } }) }), { MINIMAX_API_KEY: "synthetic-image-key" }), /格式/);
  await assert.rejects(generateMiniMaxImage("示意图", "16:9", async () => ({ ok: true, text: async () => JSON.stringify({ base_resp: { status_code: 0 }, data: { image_urls: ["https://untrusted.example/a.png"] } }) }), { MINIMAX_API_KEY: "synthetic-image-key" }), /无效/);
});
