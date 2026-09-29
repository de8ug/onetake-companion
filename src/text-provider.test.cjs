const test = require("node:test");
const assert = require("node:assert/strict");
const { generate, status, config } = require("./text-provider.cjs");
test("MiniMax default and status never expose keys", () => {
  assert.equal(config().name, "minimax");
  const s = status({ GLM_API_KEY: "private-test-key" });
  assert.equal(s[0].configured, true);
  assert.ok(!JSON.stringify(s).includes("private-test-key"));
  assert.throws(() => config("arbitrary-url"));
});
test("GLM request goes only to official standard endpoint", async () => {
  let request;
  const r = await generate(
    "glm",
    [{ role: "user", content: "test" }],
    undefined,
    async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "{}" } }] }),
      };
    },
    { GLM_API_KEY: "test" },
  );
  assert.equal(
    request.url,
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  );
  assert.equal(request.body.max_tokens, 24000);
  assert.equal(request.body.model, "glm-5.3");
  assert.equal(request.body.thinking.type, "enabled");
  assert.equal(r.provider, "glm");
});
test("MiniMax remains independently selectable", async () => {
  await generate(
    "minimax",
    [],
    undefined,
    async (url, options) => {
      assert.equal(url, "https://api.minimaxi.com/v1/chat/completions");
      assert.equal(JSON.parse(options.body).thinking.type, "disabled");
      return { ok: true, json: async () => ({ choices: [] }) };
    },
    { MINIMAX_API_KEY: "test" },
  );
});
test("upstream errors are sanitized and never silently switch providers", async () => {
  let calls = 0;
  await assert.rejects(
    generate(
      "glm",
      [],
      undefined,
      async () => {
        calls++;
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { message: "private-test-key" } }),
        };
      },
      { GLM_API_KEY: "private-test-key", MINIMAX_API_KEY: "backup" },
    ),
    (e) => e.message.includes("429") && !e.message.includes("private-test-key"),
  );
  assert.equal(calls, 1);
});
test("missing GLM credential does not use MiniMax key", async () => {
  await assert.rejects(
    generate(
      "glm",
      [],
      undefined,
      () => {
        throw Error("must not call");
      },
      { MINIMAX_API_KEY: "test" },
    ),
    /GLM_API_KEY/,
  );
});
