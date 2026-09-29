# OneTake 口播视频工作台 / Video Workbench

Lightweight local finishing tools for OneTake. No OneTake source checkout, web renderer, cloud media storage, npm dependencies, or bundled model account required.

## Responsibility

- Skill or manual authoring: research, conversational script, assets, complete editable projects.
- OneTake web/app: project rendering, cameras, teleprompter, recording.
- Workbench: free editable project preparation (whiteboard v2 / talking-head v4), personal-key MiniMax/GLM drafts, local project library, and optional official PRO silence removal plus confirmed cover export. Deterministic packaging uses local format fixtures, not the OneTake renderer.

## Free And PRO

Project authoring, model settings, three narrative structures, draft editing, packaging, project folders, Downloads association and explicit OneTake import are free. Model requests use the creator's key and may incur provider charges. Official HTTP silence analysis and cover/video rendering require pairing and a valid PRO authorization. The independent open-source CLI is not subscription-locked. Existing OneTake recording/presentation entitlements are not changed by this package.

Start the launcher, then open `http://127.0.0.1:3010`. The same-origin local UI needs no pairing for free project preparation. It supports topic/audience/structure, manual templates, per-part scripts, duration, quotes or whiteboard keywords/camera layout, cover text and four publishing keywords. AI output is only an editable draft: malformed output fails rather than silently delivering a broken project. This version generates text and diagrams, not researched/downloaded images or generated media; add approved assets in OneTake after import. Whiteboard imports are web-only; talking-head projects also pass the current mobile importer.

## Local Files And Import

The editor uses four tabs: script, cover/publication, import/video and advanced JSON. Scripts are edited one segment at a time with a selector and previous/next buttons. Switching tabs or segments retains in-memory edits; use Save Project to persist them. Model settings open separately in a dialog.

Default library: `~/Documents/OneTake视频工作台` (override `ONETAKE_WORKSPACE_DIR`). Each UUID-indexed project holds the editable `content-plan.json`, portable `project.onetake.json`, script/source/publishing notes, a no-camera `preview.html`, `assets/`, `originals/`, `exports/` and `manifest.json`.

Known Downloads recordings are indexed by exact filename, size and modification time; they are **not copied**. If the browser original is not in the configured Downloads folder, the official editor sends it to loopback once, stores it under that project's `originals/`, then reuses its ID. Cover-only changes do not upload the video again. Originals are never moved out of Downloads or overwritten. Changed/moved files require re-selection. Covers and resulting MP4s are archived in the project's `exports/`; temporary output is removed after the saved export succeeds. The browser does not automatically fetch another full copy of the finished video.

Import defaults to local `http://127.0.0.1:3001`, not production. The creator may explicitly select `https://onetake.show`. A 10-minute, one-use, target-origin-bound ticket exposes just the project and publication, never keys, pairing, media or subscriptions. The OneTake page asks before replacing the current project. Production requires deployment of the matching importer and browser local-network permission; download/manual import is the fallback. Manual download/import does not preserve the automatic workspace association in this version; existing non-workspace recording flows retain their Downloads export behavior. OneTake-side edits are not automatically written back to the authored plan; save/download them explicitly. No directories are silently scanned or migrated.

## Run

Install Node.js 22+ and FFmpeg/ffprobe on PATH. No `npm install` is needed.

```sh
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

Media never goes through the OneTake online backend. The web adapter uses exact recorded filename/size in Downloads when possible; otherwise it receives one local upload and retains a private original copy for later cover changes. Only user-requested draft text and the selected personal key go to the model provider. License checks send a license token to the configured authorization service, not media or model keys.

Private state, logs, imported copies and exported files are not automatically deleted. Keys are local plaintext protected by filesystem permissions, not encrypted storage or a system keychain. Windows ACL hardening and signed installation remain separate work. See [SECURITY.md](SECURITY.md) and [API.md](API.md).

Synthetic tests cover source independence, paired official-origin HTTP processing, invalid authorization, local key persistence, no key echo, symlink rejection, Downloads reuse, original preservation and FFmpeg cover export. They do not replace long-recording, real browser, Windows or paid model-call testing.

## Open Source

MIT for this source. FFmpeg is installed separately and has its own license/build conditions; no FFmpeg binary, fonts, recordings, keys or OneTake project data are distributed here. No GitHub repository has been published by this extraction.

Built alongside [OneTake](https://onetake.show) by HaoGe AI Lab (浩哥 AI 实验室). Links and default output names are editable; no unremovable advertising overlay is inserted by Companion.
