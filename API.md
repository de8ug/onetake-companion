# Browser Adapter

Only loopback. Default port 3010. Exact Host and Origin checks. Data routes require `Authorization: Bearer <local-pairing-token>` or the same-origin HttpOnly workbench session. Local session POSTs require the exact local Origin. OPTIONS accepts allowed origins without authentication. CORS alone is not authorization. Never expose the port publicly.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /status | Version, busy state, model configured flags and capabilities; no secrets |
| POST | /quick-edit/analyze-silence | Video bytes or exact OneTake Downloads filename/size; returns duration, cuts and recordingId |
| POST | /quick-edit/render | PNG cover followed by video, or PNG plus prior recordingId; queues local export |
| GET | /quick-edit/render/:id | Export progress/result |
| GET | /quick-edit/render/:id/file | Explicit completed result download |
| POST | /quick-edit/render/:id/open-folder | Explicit user request to show export directory |
| POST | /model-settings | Save supported provider, personal key, optional model locally |
| POST | /talkinghead/script | Existing bilingual draft contract |
| POST | /talkinghead/broll | Existing editable text cards and image-selection suggestions, not generated image bytes |
| GET | / | Local workbench UI; creates Strict HttpOnly session cookie |
| GET | /workbench/projects | Project manifests and configured library/Downloads paths |
| POST | /workbench/seed | Free editable manual plan |
| POST | /workbench/generate | Personal-key structured AI plan; no automatic retry or provider fallback |
| POST | /workbench/projects | Validate/pack a new authored plan |
| GET/POST | /workbench/projects/:id | Read manifest / update and repack authored plan |
| GET | /workbench/projects/:id/plan | Editable content-plan JSON |
| GET | /workbench/projects/:id/file?name=… | Allowlisted project or note file, not arbitrary filesystem access |
| POST | /workbench/projects/:id/handoff | Target local or production; return one-use scoped import URL |
| GET | /workbench/import | Target-origin-bound `X-OneTake-Import` ticket; exception to full pairing |
| POST | /workbench/projects/:id/open-folder | Explicit native folder opening |
| POST | /workbench/recordings/register | Exact projectId/filename/size Downloads reference, no media upload |

Only `/quick-edit/` processing POSTs require `X-OneTake-License` and a successful configured PRO validation. Model settings and project generation are free but authenticated. Existing result retrieval/folder opening requires authentication. Legacy rendering `/jobs` returns 410; prepare projects with the workbench or Skill.

Managed analysis uses `?projectId=<workspaceUUID>&filename=<encoded original name>`; the existing Downloads JSON hint is preferred, raw bytes are fallback. Render options include `workspaceProjectId` and the analysis `recordingId` to resolve persistent project sources and save exports/cover into the linked project. Unlinked clients remain compatible and export to Downloads. No request accepts a browser-supplied absolute filesystem path.

Render headers: `X-OneTake-Cover-Bytes` (PNG prefix length), `X-OneTake-Video-Type`, `X-OneTake-Render-Options` (ASCII-safe JSON with cuts, recordingId/outputName as applicable). Upload limit 800 MB; PNG limit 8 MB; cut limit 100. Browser changes remain in OneTake, not this package. `/status` capabilities include `localMedia:true`, `personalKeyDrafting:true`, `legacyWhiteboard:false`; legacy project outputs are not enumerated.
