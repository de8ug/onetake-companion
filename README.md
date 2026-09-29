# OneTake Companion

Lightweight local finishing tools for OneTake. No OneTake source checkout, web renderer, cloud media storage, npm dependencies, or bundled model account required.

## Responsibility

- Skill or manual authoring: research, conversational script, assets, complete editable projects.
- OneTake web/app: project rendering, cameras, teleprompter, recording.
- Companion: silence analysis, reviewed cuts, confirmed PNG cover insertion, local MP4 export. Optional personal-key MiniMax/GLM script and text-card drafts, not a second full project generator.

## Run

Install Node.js 22+ and FFmpeg/ffprobe on PATH. No `npm install` is needed.

```sh
node launcher.cjs
node launcher.cjs --check
npm test
```

macOS can use `start.command`; Windows can use `start.cmd`. Source-level Windows launch support is included but Windows devices and ACLs have not been verified. This is not a signed installer or bundled runtime.

Default: loopback `127.0.0.1:3010`, private state `~/.onetake-pro`. First browser connection needs pairing. Official browser processing also validates PRO with the existing license service. Optional model keys are not needed for video editing.

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
