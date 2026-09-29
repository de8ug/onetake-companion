"use strict";
const $ = id => document.getElementById(id);
let plan, project;
let activePart = 0;
const tabNames = ["script", "publication", "files", "json"];
function selectTab(name, focus = false) {
  for (const key of tabNames) {
    const selected = key === name;
    $("tab-" + key).setAttribute("aria-selected", String(selected));
    $("tab-" + key).tabIndex = selected ? 0 : -1;
    $("panel-" + key).hidden = !selected;
  }
  if (focus) $("tab-" + name).focus();
}
for (const [index, name] of tabNames.entries()) {
  $("tab-" + name).onclick = () => selectTab(name);
  $("tab-" + name).onkeydown = event => {
    const target = { ArrowRight: (index + 1) % tabNames.length, ArrowLeft: (index + tabNames.length - 1) % tabNames.length, Home: 0, End: tabNames.length - 1 }[event.key];
    if (target !== undefined) { event.preventDefault(); selectTab(tabNames[target], true); }
  };
}
function ask(message) {
  const dialog = $("confirmation"); $("confirmation-message").textContent = message; dialog.returnValue = "cancel";
  return new Promise(resolve => { dialog.addEventListener("close", () => resolve(dialog.returnValue === "yes"), { once: true }); dialog.showModal(); });
}
async function api(url, data) {
  const response = await fetch(url, data === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "操作失败");
  return result;
}
function notice(message, error = false) { $("notice").textContent = message; $("notice").classList.toggle("error", error); }
function action(id, fn) { $(id).onclick = async () => { $(id).disabled = true; try { await fn(); } catch (e) { notice(e.message, true); } finally { $(id).disabled = false; } }; }
function parts() { return plan[plan.mode === "whiteboard" ? "pages" : "segments"]; }
function field(parent, label, value, change, multiline = false, type = "text") {
  const wrap = document.createElement("label"); wrap.append(document.createTextNode(label));
  const input = document.createElement(multiline ? "textarea" : "input");
  if (multiline) input.rows = 3; else input.type = type;
  input.value = value ?? ""; input.oninput = () => { change(input.value); syncJSON(); };
  wrap.append(input); parent.append(wrap); return input;
}
function syncJSON() { $("plan-json").value = JSON.stringify(plan, null, 2); }
function readCommon() {
  Object.assign(plan, { title: $("title").value, corePoint: $("core-point").value, coverTitle: $("cover-title").value, coverSubtitle: $("cover-subtitle").value });
  plan.publication = { description: $("description").value, keywords: $("keywords").value.split(/[,，]/).map(s => s.trim()).filter(Boolean) };
  syncJSON();
}
function showPlan(value, reset = false) {
  if (reset) { activePart = 0; selectTab("script"); }
  plan = value; $("start").hidden = true; $("editor").hidden = false;
  $("editor-heading").textContent = plan.mode === "whiteboard" ? "白板工程草稿" : "口播工程草稿";
  for (const [id, key] of [["title", "title"], ["core-point", "corePoint"], ["cover-title", "coverTitle"], ["cover-subtitle", "coverSubtitle"]]) $(id).value = plan[key] || "";
  $("description").value = plan.publication.description; $("keywords").value = plan.publication.keywords.join("，");
  renderPart();
  $("saved").hidden = !project; $("unsaved").hidden = Boolean(project); syncJSON();
}
function renderPart() {
  activePart = Math.max(0, Math.min(activePart, parts().length - 1));
  $("part-count").textContent = `共 ${parts().length} 段 · 约 ${parts().reduce((sum, part) => sum + (Number(part.seconds) || 0), 0)} 秒`;
  $("part-select").replaceChildren();
  parts().forEach((part, i) => {
    const option = document.createElement("option"); option.value = i;
    option.textContent = `第 ${i + 1} 段 · ${part.name || part.role || "未命名"}`;
    $("part-select").append(option);
  });
  $("part-select").value = String(activePart);
  $("previous-part").disabled = activePart === 0;
  $("next-part").disabled = activePart >= parts().length - 1;
  $("parts").replaceChildren();
  parts().forEach((part, i) => {
    if (i !== activePart) return;
    const row = document.createElement("section"); row.className = "part";
    const heading = document.createElement("div"); heading.className = "part-heading"; heading.textContent = `第 ${i + 1} 段`;
    const remove = document.createElement("button"); remove.textContent = "删除";
    remove.disabled = parts().length === 1 || plan.mode === "whiteboard" && i === 0;
    remove.onclick = () => { readCommon(); parts().splice(i, 1); showPlan(plan); }; heading.append(remove); row.append(heading);
    field(row, "段落名称", part.name || part.role, v => { part[plan.mode === "whiteboard" ? "name" : "role"] = v; });
    field(row, "口播词", part.text, v => { part.text = v; }, true);
    field(row, "预计秒数", part.seconds, v => { part.seconds = Number(v); }, false, "number");
    if (plan.mode === "talkinghead") {
      field(row, "金句（可留空）", part.quote, v => { if (v) part.quote = v; else { delete part.quote; delete part.emphasis; } });
      field(row, "高亮词", part.emphasis, v => { part.emphasis = v; });
    } else {
      const label = document.createElement("label"); label.textContent = "镜头"; const select = document.createElement("select");
      for (const [v, t] of [["camera-full", "真人全屏"], ["split", "上白板 · 下真人"], ["board-pip", "白板 · 角落真人"]]) { const option = document.createElement("option"); option.value = v; option.textContent = t; select.append(option); }
      select.value = part.camera; select.onchange = () => {
        readCommon(); part.camera = select.value;
        if (part.camera !== "camera-full" && !part.board) part.board = { diagram: "flow", kicker: "重点", headline: "请填写这一页重点", items: ["问题", "方法"], footer: "" };
        showPlan(plan);
      }; label.append(select); row.append(label);
      if (part.board) {
        field(row, "白板大字", part.board.headline, v => { part.board.headline = v; }, true);
        field(row, "图示项（每行一项）", part.board.items.join("\n"), v => { part.board.items = v.split("\n").map(s => s.trim()).filter(Boolean); }, true);
        field(row, "页面总结", part.board.footer, v => { part.board.footer = v; });
      }
    }
    field(row, "镜头 / 素材说明", part.shot, v => { part.shot = v; }, true);
    $("parts").append(row);
  });
}
$("part-select").onchange = () => { readCommon(); activePart = Number($("part-select").value); renderPart(); };
$("previous-part").onclick = () => { readCommon(); activePart--; renderPart(); };
$("next-part").onclick = () => { readCommon(); activePart++; renderPart(); };
async function refresh() {
  const result = await api("/workbench/projects");
  $("root-path").textContent = result.root; $("project-list").replaceChildren();
  for (const item of result.projects) {
    const button = document.createElement("button"); button.textContent = item.title; button.classList.toggle("active", item.id === project?.id);
    const small = document.createElement("small"); small.textContent = `${item.mode === "whiteboard" ? "白板" : "口播"} · ${item.state === "draft" ? "待创作者确认" : item.state}`; button.append(small);
    button.onclick = async () => { try { project = await api(`/workbench/projects/${item.id}`); showPlan(await api(`/workbench/projects/${item.id}/plan`), true); showFiles(); await refresh(); } catch(e) { notice(e.message, true); } }; $("project-list").append(button);
  }
}
function showFiles() {
  $("directory").textContent = project.directory || ""; $("saved").hidden = false;
  for (const [id, items] of [["recordings", project.recordings], ["exports", project.exports]]) {
    $(id).replaceChildren(); for (const item of items || []) { const li = document.createElement("li"); li.textContent = item.filename ? `原片：${item.filename} · ${item.kind === "downloads" ? "引用 Downloads，未复制" : "工程内原片"}` : `成片：${item.name} · 封面：${item.coverName}`; $(id).append(li); }
  }
}
function input() { return { mode: $("mode").value, topic: $("topic").value, audience: $("audience").value, notes: $("notes").value, structure: $("structure").value, seconds: Number($("seconds").value), provider: $("provider").value }; }
$("start-form").onsubmit = async e => { e.preventDefault(); try { project = null; showPlan((await api("/workbench/seed", input())).plan, true); notice("手工草稿已准备；请编辑后保存。"); } catch(e) { notice(e.message, true); } };
action("generate", async () => {
  if (!$("start-form").reportValidity()) return;
  if (!await ask("将话题、观众和材料发送给所选模型服务商，使用你自己的 API Key 并可能计费。请勿提交未公开资料。现在生成？")) return;
  notice("正在生成；不会自动重试或切换模型。");
  const result = await api("/workbench/generate", input()); project = null; showPlan(result.plan, true); notice("模型草稿已通过结构校验；事实、素材和表达仍需你确认。");
});
action("save", async () => {
  readCommon(); const result = await api(project ? `/workbench/projects/${project.id}` : "/workbench/projects", { plan });
  project = await api(`/workbench/projects/${result.id}`); showPlan(await api(`/workbench/projects/${project.id}/plan`)); showFiles(); await refresh(); notice("工程已保存。图片等素材可在 OneTake 导入后继续添加；当前生成器只制作文字和图示。");
});
action("apply-json", async () => { const value = JSON.parse($("plan-json").value); if (!value.publication || !Array.isArray(value[value.mode === "whiteboard" ? "pages" : "segments"])) throw new Error("不是工作台草稿格式，请选择 content-plan.json"); showPlan(value); notice("已应用，保存时会校验并打包。"); });
$("plan-file").onchange = async e => { try { const file = e.target.files[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) throw new Error("草稿文件过大"); $("plan-json").value = await file.text(); $("apply-json").click(); } catch(e) { notice(e.message, true); } finally { e.target.value = ""; } };
action("add-part", async () => {
  readCommon(); if (parts().length >= 12) throw new Error("最多 12 段");
  const id = `part-${Date.now()}`;
  parts().push(plan.mode === "talkinghead" ? { id, role: "新段落", text: "请填写这一段要说的话。", seconds: 20, shot: "真人口播" } : { id, name: "新页面", text: "请填写这一页要说的话。", seconds: 20, shot: "白板讲解", camera: "board-pip", board: { diagram: "flow", kicker: "重点", headline: "请填写页面重点", items: ["问题", "方法"], footer: "" } }); activePart = parts().length - 1; selectTab("script"); showPlan(plan);
});
action("import-project", async () => {
  if (!await ask("将导入已保存的工程，未保存修改不会带过去。继续？")) return;
  if ($("target").value.startsWith("https:") && !await ask("这次会打开线上 onetake.show。如果线上尚未部署导入功能，请下载工程后手动导入。继续打开线上版？")) return;
  const win = window.open("about:blank", "_blank"); if (win) win.opener = null;
  try { const result = await api(`/workbench/projects/${project.id}/handoff`, { target: $("target").value }); if (win) win.location = result.url; else throw new Error("浏览器阻止打开页面，请允许弹窗后重试，或下载工程手动导入"); notice("已打开所选 OneTake；在那里确认导入。凭证 10 分钟有效，不包含 API Key。"); } catch(e) { win?.close(); throw e; }
});
action("download-project", async () => { const a = document.createElement("a"); a.href = `/workbench/projects/${project.id}/file?name=project.onetake.json`; a.download = `${project.title}.onetake.json`; a.click(); });
action("open-folder", async () => { await api(`/workbench/projects/${project.id}/open-folder`, {}); });
$("recording-file").onchange = async e => { try { const file = e.target.files[0]; if (!file) return; await api("/workbench/recordings/register", { projectId: project.id, filename: file.name, size: file.size }); project = await api(`/workbench/projects/${project.id}`); showFiles(); notice("已关联本机原片，只发送名称和大小，没有传视频。"); } catch(e) { notice(e.message, true); } finally { e.target.value = ""; } };
async function refreshModelStatus() {
  const result = await api("/status");
  $("model-status").textContent = result.textProviders.map(p => `${p.provider || p.id}：${p.configured ? "已配置" : "未配置"}`).join(" · ");
}
action("settings-toggle", async () => { $("settings").showModal(); $("model-result").textContent = ""; await refreshModelStatus(); });
$("settings-close").onclick = () => $("settings").close();
$("model-form").onsubmit = async e => {
  e.preventDefault(); const button = $("model-form").querySelector("button[type=submit]");
  button.disabled = true; $("model-result").textContent = "正在保存…"; $("model-result").classList.remove("error");
  try {
    await api("/model-settings", { provider: $("provider").value, key: $("key").value, model: $("model").value });
    $("key").value = ""; await refreshModelStatus();
    $("model-result").textContent = "已保存到本机，可开始生成工程。";
  } catch (error) { $("model-result").textContent = error.message; $("model-result").classList.add("error"); }
  finally { button.disabled = false; }
};
$("new-project").onclick = async () => { if (plan && !await ask("离开当前草稿？请先保存需要保留的修改。")) return; project = null; plan = null; $("start").hidden = false; $("editor").hidden = true; notice(""); };
for (const id of ["title", "core-point", "cover-title", "cover-subtitle", "description", "keywords"]) $(id).oninput = readCommon;
refresh().catch(e => notice(e.message, true));
