# Security Boundary

- Local service binds only 127.0.0.1. Exact Host/Origin allowlist plus private pairing prevents unrelated pages from controlling the device.
- PRO validation is an official integration boundary, not DRM over open-source CLI. Pairing and subscription serve different purposes.
- License URL is operator configuration, never accepted from an incoming page; HTTPS required except localhost development, redirects refused.
- Browser cannot pass arbitrary paths to editing. Downloads lookup requires OneTake naming, exact size and a regular file; cached originals use generated IDs. Direct symlink inputs/settings are rejected. Trusted CLI accepts explicit local regular-file paths.
- Originals and existing exports are never overwritten. FFmpeg receives argument arrays, not shell text. Serial processing limits resource contention.
- Model keys and pairing tokens must stay in private state. POSIX files use 0600; private home uses 0700 when created. Existing directory ACLs, shared home folders and Windows permissions need operator review. Private model files are plaintext, not encryption.
- Local malware running as the same OS user is outside this protection boundary. Pairing stored in a website's local storage can be read by compromised same-origin script; keep OneTake's origin and dependencies secure.
- Do not commit config files, personal media, logs or payment/license tokens. Report vulnerabilities privately to the maintainer before sharing reproduction data containing secrets.
- Local free UI sessions are HttpOnly/SameSite=Strict and require same-origin POSTs; pages cannot embed the UI. Cookie sessions are invalidated when the process restarts. A one-use import ticket is deliberately narrower than pairing, binds to the chosen target Origin, expires after ten minutes and is not sent to analytics/referrers as a query parameter. OneTake removes the fragment after confirmation/cancellation. Never forward an unconsumed import link publicly.
- Model output is parsed/whitelisted structured data, not executed HTML, arbitrary file paths or code. No remote resources are fetched by generation. Provider calls happen only after explicit creator action, and draft failure does not authorize automatic retries or provider switching. Semantic quality and factual correctness are not guaranteed by structural validation.
- The library is local, not account-synced cloud storage. It contains authored scripts and media metadata. Publishing remains manual. Back it up deliberately and do not distribute personal project folders with the source.
