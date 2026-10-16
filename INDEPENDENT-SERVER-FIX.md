# Independent server connection fix — 2026-10-16 UTC

The dashboard is configured only for `http://blynk.allmixedupocean.net:8080`.

## Demonstrated faults

- Version 4 still allowed Blynk Cloud hostnames and mentioned Cloud in host validation. Live cards also retained “Cloud value” labels despite the independent-server configuration.
- Production owner requests to `/api/blynk` at 01:32:39 and 01:33:37 UTC returned HTTP 502 in 4 ms. Those logs contain no response body, so they cannot establish the exact text the user saw.
- A deployed, owner-private test site reproduced a separate runtime fault using only a fixed all-zero dummy token: `fetch` with `redirect: "error"` throws `TypeError: Invalid redirect value, must be one of "follow" or "manual"` immediately, before network access. This is a real hosted-runtime test, not a mocked fetch.

## Changes

- The form and server share a single independent-server address. The address is displayed read only. Cloud or arbitrary hosts are rejected before sending a token; stale forms receive a reload instruction.
- Legacy HTTP reads use `redirect: "manual"`. Every 3xx response is explicitly blocked. Tokens are never forwarded to a redirect target.
- Errors distinguish HTTP rejection, rate limits, redirects, bad responses, network failures and timeouts. Logs record only controlled error codes, operation names and upstream HTTP status. Raw upstream URLs, exception messages, project metadata and credentials are excluded.
- Live labels say “Server value”. Existing authorization, stored snapshots, chart sampling, CSV behavior and owner-tab update dependence remain unchanged.

## Independent deployed evidence

The separate private restore-test site was rebuilt with the same fixed-server probe and supported redirect option. At approximately 01:41 UTC it returned:

| Read-only endpoint (dummy token omitted) | Status | Body | Worker elapsed time |
| --- | --- | --- | --- |
| `/project` | 400 | `Invalid token.` | 168 ms |
| `/isHardwareConnected` | 400 | `Invalid token.` | 65 ms |

The earlier unsupported option threw immediately for both endpoints. The changed option therefore fixes the demonstrated hosting fault and establishes reachability of this HTTP API from the hosting runtime. No real device credentials were used. The diagnostic route exists only on the owner-private test site, never on the public dashboard.

## Validation and limits

TypeScript checks and the production build pass. The updated audit suite has 31 passing checks. They include actual route code, SQLite initialized from the database migration, mocked upstream project/pin responses, simulated platform identities, deterministic React hooks, CSV checks, fixed-host validation, stale-form rejection, blocked redirects and token-safe failures. These are not real browser sessions or a live hardware test.

Actual token acceptance, real project pin discovery and device readings remain unverified. Reload the public dashboard and connect through the owner form using the independent server's project/device token. Never paste that token into chat. The exact Cloud-related message originally reported remains unconfirmed because no screenshot or exact response body was available.

The server-to-Blynk hop on port 8080 remains unencrypted HTTP. Shared updates require the owner's connected page to be open, visible and unpaused. This correction does not add unattended polling or historical imports.

The backup contains the current committed source and tests. Earlier audit reports are historical. Clean installation and separate-site restoration were previously verified for version 3; a full clean restoration of this exact later revision has not been repeated.
