# Blynk Pulse reliability audit

Completed 2026-10-14. Updated dashboard: https://akhil-blynk-pulse.brawnyfir8.chatgpt.site

## Result and verification boundaries

Published version 3 from source commit `6f777ae9544e9a45280e2e2cc90c2b048f506a2c`. The existing layout and public audience are preserved; native hosting settings show zero additional editors. The live shared_dashboard table contained zero rows before and after publication. No production fixture readings were written, and its database schema was not changed.

The initial 16 controlled checks produced 7 passes and 9 failures. After fixes and additional scenarios, all 24 controlled checks passed. The same 24 passed in a fresh checkout restored from exported ZIP bytes. TypeScript checks and production builds passed in the original and restored checkouts. A separate private test Site deployed successfully and its DB binding and shared_dashboard migration were verified through native inspection.

These results do not establish actual hardware accuracy, real Blynk account configuration, deployed endpoint authorization, or browser rendering. Those limitations are detailed below. Earlier claims of general successful testing should be read within these narrower boundaries.

## Starting material

- Deployed version 2 provenance was checked against source commit `b7de1bf82556eaae5a600ceac1fc5f410373b03f`; the source helper opened that exact commit.
- Native hosting access was public, with the original owner and no additional editors.
- Native database inspection found DB / shared_dashboard and no saved rows. There were no real shared readings to compare.
- The previous source ZIP was inspected. Its exporter had lost executable file modes, and that defect was reproduced by clean dependency installation returning Permission denied for scripts/sites-env.sh.
- Blynk's official documented getAll and isHardwareConnected endpoints were reviewed. Fixture responses follow their documented shapes.
- No actual device firmware, serial output, Blynk template/datastream configuration, valid device token, or raw live Blynk response was supplied or accessible. Synthetic fixtures are clearly identified and are not measurements from the user's device.

## Reproduced failures and minimal fixes

| Problem | Independently expected behavior | Before | After |
|---|---|---|---|
| Delayed older snapshot | Saving value 40 at newer fetch time, then value 10 at an older time, must retain 40 | Stored 10 | Stored 40; atomic database condition ignores outdated writes |
| Delayed label change at equal fetch time | Metadata revision 3 must survive a later-arriving revision 2 | Old label replaced new label | Revision 3 retained |
| Fetch/publication timestamp ambiguity | Fetch time and server acceptance of a shared save must be distinguishable | No publication timestamp; public label reused fetched time | Separate fetchedAt and server-assigned publishedAt, plus per-page observedAt in CSV |
| Time window does not expire | A sample older than 15 elapsed minutes must leave a 15-minute chart even if snapshots repeat | Old sample remained | Window recomputes when the clock advances |
| Device histories mix | A new connection session must not inherit the previous device's history | Two devices appeared in one history | New source session clears old history |
| Owner reload loses saved view | Reload should display the saved snapshot without restoring a token | Owner saw demo data | Owner loads saved snapshot and must reconnect before writes |
| Tiny numeric value rounds to zero | 0.000125 must remain nonzero | Displayed 0 | Displayed 0.000125 |
| CSV changes numeric negatives | Numeric -12.75 must export as a numeric literal; formula-like text must be escaped | Numeric negative gained an apostrophe; leading-whitespace formula text was not escaped | Numbers preserved; formula-like text escaped after whitespace |
| Demo cards disagree with chart | Latest temperature card and latest demo sample must both be 24.6 | Chart sample differed | Latest sample matches card |
| Source restoration permissions | Extracted shell helpers must retain executable bits | Fresh install failed | Export preserves Git executable modes; repaired ZIP restored successfully |

An additional lifecycle test caught an immediate reconnect sample being temporarily excluded because the window clock had not refreshed. Successful data receipt now refreshes the clock immediately. Repeated public snapshots were already deduplicated in the baseline and that behavior is preserved.

## Controlled end-to-end evidence

Fixture clock: 2026-10-14T22:00:00+00:00. Fixture raw cloud payload:

```json
{
  "getAll": {
    "v0": -12.75,
    "v1": 0.000125,
    "v2": "standby",
    "v3": [
      1,
      2
    ],
    "v4": " =2+2",
    "d0": 1
  },
  "isHardwareConnected": true
}
```

| Field | Raw controlled cloud input | Proxy / SQLite snapshot | Display or CSV expectation |
|---|---|---|---|
| V0 | numeric -12.75 | -12.75 unchanged | Numeric -12.75 in CSV |
| V1 | numeric 0.000125 | 0.000125 unchanged | Nonzero display and numeric CSV |
| V2 | string standby | standby unchanged | Text standby |
| V3 | array [1,2] | [1,2] unchanged | JSON array in a quoted CSV cell |
| V4 | string with leading space followed by =2+2 | Original string unchanged in data | CSV text receives a leading apostrophe to prevent formula execution |
| D0 | numeric 1 | 1 unchanged | Numeric 1 |
| Online state | true / controlled false fixture | Boolean retained | Offline values remain visible but are not added as chart samples |

The actual app/api/blynk route was called with an authenticated identity fixture and a mocked upstream HTTP transport. Its output was then sent through the actual app/api/dashboard route and inspected via an actual SQLite database initialized from the shipped migration. Transport used the selected Blynk HTTPS hostname, no-store caching, and no redirects. The physical-device → real Blynk segment was unavailable.

The CSV came from the actual dashboard export handler under a simulated React lifecycle. Python's independent csv parser verified its timestamp headers, negative number, tiny number, text, array and formula escaping. The first Python oracle incorrectly assumed fixed column positions; D0 sorts before V0. The oracle was corrected to map by exported pin headers and then passed. This was a test-oracle error, not an additional product failure.

Independent chart expectations use [10,20,30]: minimum 10, arithmetic sample mean 20, maximum 30. Boundary tests include exactly 15 minutes, one millisecond outside, a future sample, and New York spring/fall DST transitions with elapsed UTC time. These are sample statistics, not time-weighted sensor statistics.

## Access-control evidence

| Check | Result | What it establishes |
|---|---|---|
| Anonymous PUT and Blynk POST | 403 | Actual route code rejects absent identity in the controlled host |
| Signed-in non-owner PUT and Blynk POST | 403 | Actual route code rejects a non-owner identity fixture |
| Incomplete identity headers | 403 | Email alone or user ID alone is insufficient |
| Owner PUT / anonymous GET | 200; expected snapshot read back | Owner-only application write rule and public application read path under the controlled host |
| Cross-origin owner PUT | 403 | Server route rejects a mismatched Origin |
| Public snapshot extra token/host fields | Omitted | Serializer excludes connection credentials |
| Production client bundle scan | No owner-email or infrastructure-token markers | Server owner rule is excluded from compiled browser assets |
| Native production policy | Public; zero additional editors | Hosting access intent preserved |

Identity headers and the Cloudflare binding were simulated in route tests. The routes, serializer, Drizzle queries and SQLite storage were real application code. These tests do not prove that production dispatch strips spoofed headers, supplies authentic owner identity, or that real anonymous/owner/non-owner sessions behave identically. Do not count the blocked production 403 responses as successful application authorization checks.

## Polling and lifecycle evidence

Controlled tests cover paused polling, hidden owner tabs, resumption, upstream failures, offline values, delayed cloud responses after disconnect, reconnect history reset, repeated snapshots, serialized public reads, ignoring older snapshots, and stale snapshots after owner updates stop. A 60-second owner refresh is conveyed to viewers so they do not declare it stale after the earlier 45-second default.

The clock-based runner invokes the real dashboard component with simulated React hooks and inspects JSX as data; icons are stubbed. It does not render a DOM, measure layout, prove React hydration behavior, or emulate mobile interactions. Hidden-tab behavior and owner-tab closure are simulated, not real browser experiments.

## Timestamp meaning

| Timestamp | Origin | Meaning and limit |
|---|---|---|
| Measurement time | Unavailable | Cannot establish when the physical sensor measured a value |
| Blynk storage time | Unavailable through the used responses | getAll exposes last stored values; the dashboard does not fetch device history |
| fetchedAt | Website server | Assigned after the two separate Blynk reads complete; values and online state are not an atomic device snapshot |
| publishedAt | Website server | Assigned when accepting a shared save; public reading is possible after database completion. It is not a recorded exact commit or first-viewer visibility time |
| observedAt | Each dashboard page | Time the page observed that online fetch, included in CSV |

A successful new fetch does not prove a fresh physical measurement. Staleness refers to the age of the website's last fetch. Display formatting uses at most 15 significant digits; CSV retains the original JSON numeric representation. Charts retain up to 720 observations and display at most the selected 2-hour window. No unattended cloud polling or durable historical storage was added.

## Reproducibility evidence

The repaired ZIP was extracted into a new source directory with its archived Unix modes applied. Every SHA256SUMS entry passed. A separate empty checkout was set up from those exact extracted bytes. It had no inherited node_modules or runtime state. The locked installer created its own node_modules, reused 640 packages from the environment's package cache, and downloaded zero; this verifies a fresh installation from the lockfile with cache reuse, not fresh registry availability.

The restored application, libraries, database files, migrations, assets and tests were byte-identical (28 files checked), and the dependency lockfile was identical. TypeScript and all 24 controlled checks passed. The restored production build succeeded. A separate private Site deployed at:

https://akhil-blynk-restore-audit.brawnyfir8.chatgpt.site

Native inspection verified DB, shared_dashboard, an empty table, owner-only access and zero additional editors. No original-site database records were copied, changed or used as restoration fixtures. The archive's code and executable modes are the verified restoration input; the final delivered ZIP additionally contains this report and evidence files.

Mac/Windows portable installation, future registry availability, real sign-in on the restored Site, and live browser/device behavior remain unverified. The separate restore Site remains private.

## Live checks that could not complete

Direct production HTTP requests to /, /api/dashboard GET/PUT and /api/blynk POST all returned Cloudflare HTTP 403 with body error code 1010. The edge rejected this automated client before application behavior could be established. Raw results are included in evidence/production-http-before.json.

The cloud-browser tab-opening operation timed out without a DOM or screenshot. No browser session or on-screen assertion was obtained; no screenshot proof or actual signed-in session result is claimed. No local preview server or browser installation was used as a substitute.

Real hardware, serial logs, actual Blynk configuration and valid credentials were unavailable. The actual device-to-cloud path, physical accuracy and units therefore remain unverified. Connect the real device through the owner dashboard and compare recorded inputs before treating this as a verified live instrumentation system.

## Files and rerunning

- tests/fixtures.json: controlled cloud inputs and independent expected values.
- tests/audit.mjs: executable 24-check audit (`node tests/audit.mjs`, Node 24+).
- evidence/baseline-results.json: initial 16 checks and failure details.
- evidence/fixed-results.json and evidence/restored-results.json: final 24 checks.
- evidence/fixture-export.csv: controlled export parsed independently.
- evidence/hosting-evidence.json: sanitized native deployment, policy, database and restoration evidence.
- evidence/production-http-before.json: raw blocked HTTP results.
- scripts/export-source.py: reusable export with executable modes and checksums.
- START-HERE.md and RESTORE-WITH-CHATGPT.md: restoration instructions.

No actual device or source-repository credentials are in the backup. Tests contain a synthetic token solely as a fixture. The owner's server-only email rule is application configuration, not an API credential. A future restoration for another owner must update that rule after identity verification.
