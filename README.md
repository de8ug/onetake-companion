# OneTake 口播视频工作台 / Video Workbench

## 简介

这是可独立运行、可研究和修改的本地视频工作台。创作者可免费手工设计口播或白板工程，也可填写自己的 MiniMax/GLM API Key 生成**待审核草稿**；工程可手动导入 OneTake。录像仍由 OneTake 网页或 App 完成。本工具还提供独立命令行：查看静音候选、按人工确认的剪切点导出，并将已准备好的 PNG 封面合入片头。它不上传录像到 OneTake 线上后端，也不会替用户发布视频。

**用 [OneTake](https://onetake.show) 把想法录出来，用本地工作台整理工程和成片。** 更多功能正在测试和完善中，请以官网实际可用状态为准。这个开源工具可独立使用；网页内自动调用的官方粗剪和封面导出仍需本地配对及有效 PRO 授权。开源命令行不受 OneTake 订阅限制，自选模型的调用费用由模型服务商收取。

首次使用请看[中文完整指南](USER_GUIDE.zh-CN.md)；接口、风险边界分别见 [API](API.md) 与 [安全说明](SECURITY.md)。当前是源码启动，不是已签名的桌面安装包；Windows 真机权限、线上网页联动和长视频稳定性仍需验证。**不要把真实 Key、配对码、私人录制或工程目录提交到此仓库。**

## English Overview

Lightweight local finishing tools for OneTake. No OneTake source checkout, web renderer, cloud media storage, or bundled model account required. ZIP publishing bundles use the MIT-licensed `fflate` dependency.

For the complete creator workflow, pairing/editing steps, project recovery, and the exact migration boundary from the earlier assistant, see [中文使用指南](USER_GUIDE.zh-CN.md).

## Responsibility

- Skill or manual authoring: research, conversational script, assets, complete editable projects.
- OneTake web/app: project rendering, cameras, teleprompter, recording.
- Workbench: free editable project preparation (whiteboard v2 / talking-head v4), personal-key MiniMax/GLM drafts, local project library, and optional official PRO silence removal plus confirmed cover export. Deterministic packaging uses local format fixtures, not the OneTake renderer.

## Free And PRO

Project authoring, model settings, three narrative structures, draft editing, packaging, project folders, Downloads association and explicit OneTake import are free. Model requests use the creator's key and may incur provider charges. Official HTTP silence analysis and cover/video rendering require pairing and a valid PRO authorization. The independent open-source CLI is not subscription-locked. Existing OneTake recording/presentation entitlements are not changed by this package.

Start the launcher, then open `http://127.0.0.1:3010`. The same-origin local UI needs no pairing for free project preparation. It supports topic/audience/structure, manual templates, per-part scripts, duration, quotes or whiteboard keywords/camera layout, cover text and four publishing keywords. AI output is only an editable draft: malformed output fails rather than silently delivering a broken project. Each talking-head segment can request a short quote, rewrite its speech as an editable image prompt, or send a manually written prompt to MiniMax image-01. Image generation requires a configured personal MiniMax key and explicit confirmation; it may incur provider charges. Generated illustrations are not evidence or verified screenshots. Whiteboard pages can request a quote for their footer, but AI images are not yet supported there. Whiteboard imports are web-only; talking-head projects also pass the current mobile importer.

## Local Files And Import

The editor uses four tabs: script, cover/publication, import/video and advanced JSON. Scripts are edited one segment at a time with a selector and previous/next buttons. Switching tabs or segments retains in-memory edits; use Save Project to persist them. Model settings open separately in a dialog.

Default library: `~/Documents/OneTake视频工作台` (override `ONETAKE_WORKSPACE_DIR`). Each UUID-indexed project holds the editable `content-plan.json`, portable `project.onetake.json`, script/source/publishing notes, a no-camera `preview.html`, `assets/`, `originals/`, `exports/` and `manifest.json`. Generated images are saved under `assets/` and embedded as image data in the portable talking-head project, so manual import does not depend on a local file path. Each left-library item has a Delete action, also available in the Import tab. After confirmation it moves the project into the library's `.trash` folder for manual recovery; externally referenced Downloads originals are untouched. Individual generated images can also be removed from their segment.

Known Downloads recordings are indexed by exact filename, size and modification time; they are **not copied**. If the browser original is not in the configured Downloads folder, the official editor sends it to loopback once, stores it under that project's `originals/`, then reuses its ID. Cover-only changes do not upload the video again. Originals are never moved out of Downloads or overwritten. Changed/moved files require re-selection. Covers and resulting MP4s are archived in the project's `exports/`; temporary output is removed after the saved export succeeds. The browser does not automatically fetch another full copy of the finished video.

Import defaults to local `http://127.0.0.1:3001`, not production. The creator may explicitly select `https://onetake.show`. A 10-minute, one-use, target-origin-bound ticket exposes just the project and publication, never keys, pairing, media or subscriptions. The OneTake page asks before replacing the current project. Production requires deployment of the matching importer and browser local-network permission; download/manual import is the fallback. Manual download/import does not preserve the automatic workspace association in this version; existing non-workspace recording flows retain their Downloads export behavior. OneTake-side edits are not automatically written back to the authored plan; save/download them explicitly. No directories are silently scanned or migrated.

## Run

Install Node.js 22+ and FFmpeg/ffprobe on PATH. In a fresh source checkout, install the locked ZIP dependency once:

```sh
npm ci
node launcher.cjs
node launcher.cjs --check
npm test
```

macOS can use `start.command`; Windows can use `start.cmd`. Source-level Windows launch support is included but Windows devices and ACLs have not been verified. This is not a signed installer or bundled runtime.

Default: loopback `127.0.0.1:3010`, private state `~/.onetake-pro`. The local workbench UI uses a private same-origin session; external full API access needs pairing. Official browser media processing also validates PRO with the existing license service. Optional model keys are not needed for video editing.

Create a private `config.env` in the state directory using `config.env.example` as a guide. On macOS/Linux, set permissions to 0600. Never place actual keys or tokens in this source checkout. The launcher reads only that private config, not OneTake's backend environment. Saved model settings override environment model values.

For deployed OneTake pages, configure `ONETAKE_LICENSE_URL` to your real HTTPS validation endpoint. No production endpoint is guessed. Local development defaults to `http://127.0.0.1:3005/api/validate-session`. Add any custom website's exact origin to `ONETAKE_ALLOWED_ORIGINS`; never use wildcards. Browser local-network permission may also be required. HTTP tests do not prove every browser's permission policy.

## Independent CLI

```sh
node cli.cjs analyze /absolute/path/video.mp4
node cli.cjs render /absolute/path/video.mp4 /absolute/path/cover.png /absolute/path/options.json
```

Options: `{"cuts":[{"start":2,"end":4,"enabled":true}],"outputName":"topic_OneTake.show.mp4"}`. Empty cuts keep the whole video. A 0.6-second silent cover is inserted at the front. Output goes to Downloads (override with `ONETAKE_DOWNLOADS_DIR`); collisions get numbered names. Originals are not overwritten. CLI has no OneTake pairing or subscription requirement. PNG is already designed by the caller; this tool does not render project elements or fonts.

## Privacy And Limits

Media never goes through the OneTake online backend. The web adapter uses exact recorded filename/size in Downloads when possible; otherwise it receives one local upload and retains a private original copy for later cover changes. Only explicitly requested draft text or image prompts and the selected personal key go to the model provider. License checks send a license token to the configured authorization service, not media or model keys.

Private state, logs, imported copies and exported files are not automatically deleted. Keys are local plaintext protected by filesystem permissions, not encrypted storage or a system keychain. Windows ACL hardening and signed installation remain separate work. See [SECURITY.md](SECURITY.md) and [API.md](API.md).

Synthetic tests cover source independence, paired official-origin HTTP processing, invalid authorization, local key persistence, no key echo, symlink rejection, Downloads reuse, original preservation and FFmpeg cover export. They do not replace long-recording, real browser, Windows or paid model-call testing.

## Open Source

MIT for this source. FFmpeg is installed separately and has its own license/build conditions; no FFmpeg binary, fonts, recordings, keys or OneTake project data are distributed here. Source repository: [de8ug/onetake-companion](https://github.com/de8ug/onetake-companion).

Built alongside [OneTake](https://onetake.show) by HaoGe AI Lab (浩哥 AI 实验室). **Record with your own voice and picture; let the tool handle the repetitive local preparation.** More features are being tested and refined; check the site for availability. Links and default output names are editable; no unremovable advertising overlay is inserted by Companion.
