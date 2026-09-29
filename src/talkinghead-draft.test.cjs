const test = require("node:test");
const assert = require("node:assert/strict");
const { generateScript, generateBroll } = require("./talkinghead-draft.cjs");

const localized = text => ({ zh: text, en: text });
const script = {
  title: localized("标题"), sourceSummary: "真实素材",
  chinese: { title: "中文", content: "真实口播内容", estimatedSeconds: 60 },
  english: { title: "English", content: "A real script", estimatedSeconds: 65, cefr: "A2-B1" },
  versionOverlays: localized("版本"), persistentOverlays: localized("画面标题"),
  materialHighlights: [1, 2].map(number => ({
    title: localized(`重点${number}`), cueText: localized("提示"), text: localized("屏幕文字"),
  })),
};
const response = data => async () => ({ data: { choices: [{ message: { content: JSON.stringify(data) } }] } });

test("talking-head draft accepts the existing project contract", async () => {
  const sourceNotes = "我真的做过一个项目，亲自测试了生成结果。";
  const result = await generateScript({ provider: "minimax", sourceNotes, durationMinutes: 1 }, response(script));
  assert.equal(result.materialHighlights.length, 2);
  assert.equal(result.materialHighlights[0].id, "highlight-1");
  await assert.rejects(generateScript({ provider: "other", sourceNotes, durationMinutes: 1 }, response(script)), /不支持/);
  await assert.rejects(generateScript({ provider: "minimax", sourceNotes, durationMinutes: 1 }, response({ ...script, materialHighlights: [] })), /素材重点/);
});

test("B-roll generation returns editable text cards, never invented image bytes", async () => {
  const items = [1, 2].map(number => ({ title: `镜头${number}`, cueText: "此处展示", textCard: "真实结果", imagePrompt: "请手动选择真实截图" }));
  const result = await generateBroll({ provider: "glm", scriptText: "这是一段供测试的真人口播稿。".repeat(5), maxItems: 2 }, response({ items }));
  assert.equal(result.length, 2);
  assert.equal(result[0].textCard, "真实结果");
  assert.equal(result[0].imageDataUrl, undefined);
});
