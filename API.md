# Browser Adapter

Only loopback. Default port 3010. Exact Host and Origin checks; all data routes require `Authorization: Bearer <local-pairing-token>`. OPTIONS accepts allowed origins without authentication. CORS alone is not authorization. Never expose the port publicly.

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

New processing/model POSTs require `X-OneTake-License` and a successful configured PRO validation. Existing result retrieval/folder opening requires pairing. Complete project generation `/jobs` returns 410; use Skill/manual project creation instead.

Render headers: `X-OneTake-Cover-Bytes` (PNG prefix length), `X-OneTake-Video-Type`, `X-OneTake-Render-Options` (ASCII-safe JSON with cuts, recordingId/outputName as applicable). Upload limit 800 MB; PNG limit 8 MB; cut limit 100. Browser changes remain in OneTake, not this package. `/status` capabilities include `localMedia:true`, `personalKeyDrafting:true`, `legacyWhiteboard:false`; legacy project outputs are not enumerated.
