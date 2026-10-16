# Pulse — Blynk dashboard

A public, read-only dashboard for the independently hosted Blynk server at `blynk.allmixedupocean.net:8080`. Only the verified owner can save connections, select a device, change settings or publish readings. Visitors see the selected device; they cannot access the private device list or its tokens.

## Saved devices

Use **Devices** to add up to 20 named project/device tokens. **Save & connect** stores a token encrypted on the server, then selects that device. The selector above the dashboard and the Devices tab switch the device shown publicly. Re-entering a saved token selects the existing connection rather than creating a duplicate.

The selected device reconnects automatically when the owner reloads or returns to the site. **Disconnect** keeps saved tokens and stops automatic reconnection until the owner selects a device again. **Remove** requires an additional confirmation and deletes that device's saved token, settings and snapshot. Removing an inactive device does not change the current selection.

Each device keeps its own labels, units and latest snapshot. First-time saving can inherit the current labels; later devices begin with their own default settings. Switching clears the page's chart history to prevent mixing readings from different devices. Returning to a device can display its older cached snapshot with its original fetch/publication timestamps while waiting for a fresh read. The pre-existing `shared_dashboard` data is retained and remains the fallback until a saved selection is first made.

## Credential protection

`BLYNK_VAULT_KEY` is a secret runtime value containing 32 cryptographically random bytes encoded as Base64. It is configured through Sites, never in source, browser code or the hosting manifest. HKDF derives separate AES-GCM and HMAC keys. Each token uses a fresh 96-bit nonce and authenticated encryption bound to the saved-device ID. The HMAC fingerprint supports duplicate detection without storing a plaintext token.

Private lists return names, IDs and display settings, never tokens, ciphertext or fingerprints. After saving, browser polling sends only the selected device ID and selection identifier. The server unlocks the token for the upstream request. Selection checks and conditional database writes reject delayed updates from an old device or another owner tab. Tokens are not put into browser storage, shared snapshots, CSV files or source exports. Failures do not log raw upstream URLs or exceptions containing tokens.

Keep the existing runtime key when redeploying. Replacing or losing it prevents old saved tokens from being unlocked. A source-only restoration starts with an empty vault and a newly generated key; saved credentials and the live database are deliberately excluded from the source backup.

The browser-to-website hop uses HTTPS. The configured server-to-Blynk connection on port 8080 uses unencrypted HTTP; this limitation is explained before token entry. The legacy API places the token in its URL path. Requests use `redirect: "manual"` and reject every 3xx response without forwarding credentials.

## Readings and refresh

The adapter reads documented legacy endpoints `/{token}/project`, `/{token}/isHardwareConnected`, and `/{token}/get/{pin}`. It discovers virtual, analog and digital project pins, uses six bounded pin-read workers and a shared 12-second deadline, and returns only values, online state and fetch time. Raw project metadata containing credentials or notification tokens is not exposed.

New saved connections start at a 5-second interval; the owner can select 5, 10, 30 or 60 seconds. Public pages check shared data every 5 seconds. Polls are serialized and pause in hidden or paused tabs. **Saving a token does not add unattended polling:** new shared readings still require a connected, visible and unpaused owner page. Visitors keep seeing cached data after it closes, with a stale status.

V0 defaults to Temperature in °F when its label/unit are absent or generic. Explicit owner settings remain editable. Live values are not numerically converted; the firmware's source unit must be established before any conversion. The illustrative demo uses Fahrenheit.

Charts and CSV exports contain page-observed online samples, retained in memory up to 1,440 points and displayed over windows of at most two hours. CSV headers include configured units. Repeated snapshots are not sampled again, old points expire, and exports retain numeric precision and escape formula-like text. No Blynk history is imported. A clearly marked sample preview appears before shared data is available.

`fetchedAt` is assigned after the separate project, connection-status and pin reads complete; they are not an atomic sensor measurement. Physical measurement and Blynk storage times are unknown. `publishedAt` is assigned when the server accepts a snapshot for persistence; reads become available after the database operation succeeds. New fetch times do not prove that the sensor measured again.

## Development, testing and restoration

Read START-HERE.md and RESTORE-WITH-CHATGPT.md. Install locked dependencies using the supplied helpers. Use Node 24 or later for `node tests/audit.mjs`, run TypeScript checks, and build with the current Sites build helper. Preserve the Vinext/Workers integration and logical D1 binding `DB`.

All migrations under `drizzle/` and their metadata are required. They add saved-device and selection tables without changing or deleting the original shared snapshot table. Sites applies migrations during deployment. Configure `BLYNK_VAULT_KEY` as a runtime secret before deploying a new installation. Confirm the owner's authenticated identity and update the server-only rule in `lib/dashboard-access.ts` when restoring for another owner.

The audit exercises actual routes, Web Crypto, SQLite initialized from migrations, controlled upstream fixtures, simulated identities and deterministic React hooks. It checks encrypted storage, authentication tampering, cross-origin rejection, reload reconnection, switching during a pending read, stale-write rejection, per-device settings, public credential exclusion, polling, charts and exports. It does not render a real browser or establish correctness of real sensor measurements. The new saved-device workflow still needs an owner to save a real token in the deployed form for live hardware verification.

The source backup excludes credentials, the runtime key, database contents, dependencies and generated output. Its earlier audit reports and evidence describe historical revisions. A ZIP export alone does not create a GitHub repository.
