const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const [input, output, assetsDir] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: build-project.cjs <content-plan.json> <output-directory>");
const plan = JSON.parse(fs.readFileSync(input, "utf8"));
const now = Date.now();
const out = path.resolve(output);
assert(["talkinghead", "whiteboard"].includes(plan.mode));
assert(["none", "natural-example"].includes(plan.productMention));
assert(plan.title && plan.audience && plan.corePoint && plan.coverTitle);
assert(plan.publication.description && new Set(plan.publication.keywords).size === 4);
assert(Array.isArray(plan.sourceNotes) && plan.sourceNotes.length);
const template = JSON.parse(fs.readFileSync(path.join(__dirname, "../contracts", plan.mode === "whiteboard" ? "whiteboard-v2.json" : "talkinghead-v4.json"), "utf8"));
const brand = plan.productMention === "none" ? "OneTake" : "OneTake｜onetake.show";
const parts = plan.mode === "whiteboard" ? plan.pages : plan.segments;
assert(Array.isArray(parts) && parts.length);
assert.equal(new Set(parts.map(p => p.id)).size, parts.length);
for (const part of parts) {
  assert(part.text && part.shot && part.seconds >= 5 && part.seconds <= 300);
  assert(!part.verification || ["pending", "own-work", "source-checked", "opinion"].includes(part.verification));
}
let project;
if (plan.mode === "talkinghead") {
  assert(parts.length <= 12);
  const assets = [];
  const segments = parts.map((part, i) => {
    const cues = [];
    if (part.quote) {
      assert(part.quote.length <= 200);
      assert(!part.emphasis || (part.emphasis.length <= 40 && part.quote.includes(part.emphasis)));
      const id = `quote-${part.id}`;
      assets.push({ id, type: "text", title: part.quote, text: part.quote, emphasis: part.emphasis || "", presentation: "quote", source: "upload" });
      cues.push({ id: `cue-${part.id}`, assetId: id, atProgress: 0, durationSeconds: 5 });
    }
    if (part.image) {
      assert(assetsDir && /^[a-f0-9-]{36}\.(png|jpg)$/.test(part.image.filename));
      const file = path.join(assetsDir, part.image.filename);
      assert(fs.lstatSync(file).isFile());
      const bytes = fs.readFileSync(file);
      const mime = part.image.filename.endsWith(".png") ? "image/png" : "image/jpeg";
      assert(bytes.length >= 100 && bytes.length <= 3_000_000);
      assert(mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff);
      const id = `image-${part.id}`;
      assets.push({ id, type: "image", title: part.role, imageDataUrl: `data:${mime};base64,${bytes.toString("base64")}`, source: "upload" });
      cues.push({ id: `image-cue-${part.id}`, assetId: id, atProgress: 0, durationSeconds: Math.min(8, part.seconds) });
    }
    return {
      id: part.id, order: i + 1, script: { zh: part.text, en: "" },
      estimatedSeconds: { zh: part.seconds, en: part.seconds }, transitionSeconds: i === parts.length - 1 ? 0 : 2,
      cues, production: { role: part.role, visualType: "person", shotNote: part.shot, sourceNote: plan.sourceNotes.join("；"), verification: part.verification || "opinion" },
    };
  });
  const content = parts.map(p => p.text).join("\n\n");
  const seconds = parts.reduce((sum, p) => sum + p.seconds, 0);
  project = {
    type: "onetake-project", version: 4, mode: "talkinghead", title: plan.title, savedAt: now,
    talkingHead: {
      ...template.talkingHead, activeLanguage: "zh", aspectRatio: "9:16",
      script: { title: { zh: plan.title, en: "" }, sourceSummary: plan.sourceNotes.join("；"), chinese: { title: plan.title, content, estimatedSeconds: seconds }, english: { title: "", content: "", estimatedSeconds: seconds, cefr: "A2-B1" }, versionOverlays: { zh: "", en: "" }, persistentOverlays: { zh: plan.coverTitle, en: "" }, materialHighlights: [] },
      teleprompterText: content, teleprompterPos: { x: 50, y: 5 }, teleprompterFontSize: 32,
      teleprompterOpacity: 0.3, scrollSpeed: 15,
      autoScroll: false, overlayText: plan.coverTitle, showOverlay: true, overlayPosition: "top", overlayColor: "#FFDF4D", overlayFont: "sans-serif", overlayFontSize: 58, overlayWidth: 84, overlayShadow: true,
      brollAssets: assets, brollSize: 100, brollPosition: 50,
      directorModeEnabled: true, directorControlMode: "manual", directorPace: 2,
      directorPlan: { version: 1, segments }, publication: plan.publication, watermarkText: brand,
    },
  };
} else {
  assert(parts[0].id === "intro");
  const rectangle = template.scenes[0].elements.find(e => e.type === "rectangle");
  const text = template.scenes[0].elements.find(e => e.type === "text");
  assert(rectangle && text);
  const rect = (id, x, y, width, height, color) => ({ ...rectangle, id, x, y, width, height, strokeColor: color, backgroundColor: color });
  const label = (id, value, x, y, width, fontSize, color = "#17232D") => ({ ...text, id, x, y, width, height: value.split("\n").length * fontSize * 1.25, text: value, originalText: value, fontFamily: 2, fontSize, baseline: fontSize, strokeColor: color, textAlign: "left" });
  const scene = (part, elements) => ({
    id: part.id, name: part.name, cameraPresentation: part.camera, durationHintMs: part.seconds * 1000,
    narration: part.text, notes: part.shot,
    elements: [rect(`${part.id}__background`, 0, 0, 720, 1280, "#FAFAF7"), ...elements].map((e, i) => ({ ...e, index: `a${i.toString(36)}` })),
  });
  const scenes = [scene({ id: "cover", name: "封面", camera: "board-pip", seconds: 1.5, text: "封面只作片头，不念。", shot: "可编辑白板封面；录制从真人开场开始。" }, [
    label("cover-brand", "OneTake", 48, 65, 624, 30),
    label("cover-heading", plan.coverTitle, 48, 285, 624, 62),
    rect("cover-accent", 48, 545, 580, 12, "#F2C94C"),
    label("cover-subtitle", plan.coverSubtitle, 48, 625, 624, 28),
  ])];
  for (const part of parts) {
    assert(["camera-full", "board-pip", "split"].includes(part.camera));
    const elements = [];
    if (part.board) {
      const b = part.board, split = part.camera === "split";
      elements.push(label(`${part.id}-kicker`, b.kicker, 48, 52, 624, 28, "#325A70"));
      elements.push(label(`${part.id}-heading`, b.headline, 48, 116, 624, 52));
      elements.push(rect(`${part.id}-accent`, 48, 268, 580, 10, "#F2C94C"));
      if (b.diagram === "compare") {
        assert(b.items.length === 2);
        b.items.forEach((value, i) => {
          elements.push(rect(`${part.id}-column-${i}`, 48 + i * 320, 320, 294, split ? 206 : 285, i ? "#E5EEF1" : "#F5E7C0"));
          elements.push(label(`${part.id}-item-${i}`, value, 66 + i * 320, 344, 258, split ? 28 : 31));
        });
      } else if (b.diagram === "branches") {
        assert(b.items.length >= 2 && b.items.length <= 3);
        elements.push(label(`${part.id}-parent`, b.parent, 48, 310, 624, 33));
        elements.push(label(`${part.id}-arrows`, b.items.length === 3 ? "↓                  ↓                  ↓" : "↓                              ↓", 80, 380, 590, 25));
        const w = 624 / b.items.length;
        b.items.forEach((value, i) => {
          elements.push(rect(`${part.id}-branch-${i}`, 48 + i * w, 430, w - 12, split ? 90 : 145, "#E5EEF1"));
          elements.push(label(`${part.id}-item-${i}`, value, 60 + i * w, 451, w - 36, b.items.length === 3 ? 25 : 30));
        });
      } else if (b.diagram === "flow") {
        assert(b.items.length <= (split ? 3 : 4));
        const step = split ? 78 : 118;
        b.items.forEach((value, i) => {
          elements.push(label(`${part.id}-item-${i}`, value, 48, 314 + i * step, 624, split ? 31 : 36));
          if (i < b.items.length - 1) elements.push(label(`${part.id}-arrow-${i}`, "↓", 48, 357 + i * step, 624, 26, "#325A70"));
        });
      } else throw new Error(`Unknown diagram in ${part.id}`);
      if (b.footer) elements.push(label(`${part.id}-footer`, b.footer, 48, split ? 562 : 860, 624, 24, "#52616B"));
    } else assert(part.camera === "camera-full");
    assert(elements.length < 36);
    scenes.push(scene(part, elements));
  }
  let atMs = 0;
  const actions = scenes.map(s => { const action = { type: "scene.show", atMs, target: { kind: "page", sceneId: s.id } }; atMs += s.durationHintMs; return action; });
  project = {
    ...template, title: plan.title, savedAt: now,
    metadata: { title: plan.title, createdAt: now, updatedAt: now, coverSceneId: "cover" }, scenes, currentSceneId: "intro", files: {},
    beautySettings: { ...template.beautySettings, aspectRatio: "9:16" },
    script: { language: "zh", title: plan.title, content: parts.map(p => p.text).join("\n\n") },
    directorPlan: { version: 1, durationMs: atMs, actions, subtitleCues: [], autoStartOnRecording: false },
  };
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "project.onetake.json"), JSON.stringify(project, null, 2));
if (path.resolve(input) !== path.join(out, "content-plan.json")) fs.copyFileSync(input, path.join(out, "content-plan.json"));
const duration = parts.reduce((sum, p) => sum + p.seconds, 0);
fs.writeFileSync(path.join(out, "录制稿与分镜.md"), [
  `# ${plan.title}`, "", `观众：${plan.audience}`, `核心观点：${plan.corePoint}`, `参考口播：${duration} 秒。默认手动分段/切页；时长仅用于准备，不限制临场发挥。`,
  "", `封面大字：\n\n${plan.coverTitle}`, `\n封面小字：${plan.coverSubtitle}`,
  "", ...parts.map((p, i) => `## ${i + 1}. ${p.name || p.role}\n\n参考 ${p.seconds} 秒；镜头：${p.camera || "真人"}。\n\n${p.text}\n\n画面：${p.shot}${p.quote ? `\n\n金句：${p.quote}；黄字重点：${p.emphasis || "无"}。` : ""}`),
  "", "## 录制前确认", "", "先通读并换成自己平时会说的词；只在确认过的地方使用第一人称经历。工程不会识别说到哪个词。手动停顿后继续，最后由本人停止。金句按意义段出现，不是自动逐字字幕。",
  "白板工程仅供网页白板导入；口播工程可供网页与当前手机口播导入。提词器不入成片。封面和发布词仍要在录后确认；白板发布词以及口播封面文案见配套文件。",
  "", "## 内容复核", "", ...(plan.review || []).map(r => `- ${r}`), "",
].join("\n\n"));
fs.writeFileSync(path.join(out, "发布词.md"), `# ${plan.title}\n\n${plan.publication.description}\n\n关键词：${plan.publication.keywords.join("、")}。\n\n封面大字：\n\n${plan.coverTitle}\n\n封面小字：${plan.coverSubtitle}\n\n发布前由本人确认；未自动发布。\n`);
fs.writeFileSync(path.join(out, "来源与核验.md"), `# 来源与边界\n\n${plan.sourceNotes.map(s => `- ${s}`).join("\n")}\n\n示意图不是实测数据；没有第三方肖像、私人录音、孩子资料、账户或密钥。${plan.productMention === "none" ? "本条不植入产品宣传；工程使用工具不等于口播必须推荐工具。" : "OneTake 只作为本人正在做的工具实例；不把 AI 与录制工具混为同一种能力。"}\n\n当前状态：稿件与工程待本人试录；未证明观看效果，未录制、未导出、未发布。\n`);
const escaped = JSON.stringify({ project, plan }).replace(/</g, "\\u003c");
const htmlTitle = plan.title.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
fs.writeFileSync(path.join(out, "preview.html"), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlTitle}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#eef1f3;color:#17232d;font-family:Arial,"PingFang SC",sans-serif}main{max-width:1100px;margin:auto;padding:20px;display:grid;grid-template-columns:minmax(240px,400px) minmax(280px,1fr);gap:28px}#frame{position:relative;aspect-ratio:9/16;overflow:hidden;background:#fafaf7}#board{position:absolute;width:720px;height:1280px;transform-origin:0 0}.el{position:absolute;white-space:pre;line-height:1.25;letter-spacing:0}.camera{position:absolute;background:#d9e3e8;color:#325a70;display:grid;place-items:center}.full{inset:0}.split{left:0;right:0;bottom:0;height:50%}.pip{right:4%;bottom:4%;width:24%;aspect-ratio:1;border-radius:50%;font-size:12px}#quote{position:absolute;left:6%;right:6%;bottom:24%;text-align:center;white-space:pre-line;background:#17232d;color:white;padding:12px;font-size:22px}mark{color:#ffdf4d;background:none}button{font-size:22px;width:44px;height:40px;border:1px solid #9dadb6;background:white;border-radius:4px;cursor:pointer}button:disabled{opacity:.35}nav{display:flex;gap:12px;align-items:center}select{width:100%;padding:10px;font-size:16px;margin:16px 0}p{line-height:1.9}h1{font-size:24px}h2{font-size:20px}.note{font-size:14px;color:#52616b}@media(max-width:680px){main{grid-template-columns:1fr;max-width:430px;padding:12px}}</style>
<main><section><div id="frame"><div id="board"></div><div id="camera" class="camera"></div><div id="quote" hidden></div></div></section><section><h1 id="title"></h1><nav><button id="prev" aria-label="上一段">←</button><span id="count"></span><button id="next" aria-label="下一段">→</button></nav><select id="pages" aria-label="选择段落"></select><h2 id="name"></h2><p id="script"></p><p id="shot" class="note"></p><p class="note">分镜排练：不启用摄像头，不是实录成片。最终样式以 OneTake 内的预览为准。</p><a href="project.onetake.json" download>下载工程</a></section></main>
<script>const data=${escaped};let i=0;const p=data.project,plan=data.plan,parts=p.mode==='whiteboard'?p.scenes:plan.segments,board=document.getElementById('board'),frame=document.getElementById('frame'),camera=document.getElementById('camera'),quote=document.getElementById('quote'),select=document.getElementById('pages');document.getElementById('title').textContent=plan.title;parts.forEach((s,n)=>{const o=document.createElement('option');o.value=n;o.textContent=(n+1)+' / '+(s.name||s.role);select.append(o)});function resize(){board.style.transform='scale('+frame.clientWidth/720+')'}function show(){const s=parts[i];board.replaceChildren();quote.replaceChildren();quote.hidden=true;camera.hidden=false;if(p.mode==='whiteboard'){for(const e of s.elements){const el=document.createElement('div');el.className='el';Object.assign(el.style,{left:e.x+'px',top:e.y+'px',width:e.width+'px',height:e.height+'px'});if(e.type==='text'){el.textContent=e.text;el.style.fontSize=e.fontSize+'px';el.style.color=e.strokeColor}else{el.style.background=e.backgroundColor}board.append(el)}camera.className='camera '+(s.cameraPresentation==='split'?'split':s.cameraPresentation==='camera-full'?'full':'pip');camera.hidden=s.id==='cover'}else{camera.className='camera full';if(s.quote){quote.hidden=false;const emphasis=s.emphasis||'';if(emphasis&&s.quote.includes(emphasis)){const at=s.quote.indexOf(emphasis);quote.append(document.createTextNode(s.quote.slice(0,at)));const mark=document.createElement('mark');mark.textContent=emphasis;quote.append(mark,document.createTextNode(s.quote.slice(at+emphasis.length)))}else quote.textContent=s.quote}}camera.textContent='本人镜头占位';document.getElementById('name').textContent=s.name||s.role;document.getElementById('script').textContent=s.narration||s.text;document.getElementById('shot').textContent=s.notes||s.shot;document.getElementById('count').textContent=(i+1)+' / '+parts.length;select.value=i;document.getElementById('prev').disabled=i===0;document.getElementById('next').disabled=i===parts.length-1;resize()}document.getElementById('prev').onclick=()=>{i--;show()};document.getElementById('next').onclick=()=>{i++;show()};select.onchange=()=>{i=Number(select.value);show()};new ResizeObserver(resize).observe(frame);show();</script></html>`);
console.log(JSON.stringify({ mode: plan.mode, title: plan.title, parts: parts.length, seconds: duration, project: path.join(out, "project.onetake.json") }));
