# Blynk Pulse source backup

This is editable source for the existing Blynk Pulse dashboard. Credentials, live database contents, installed dependencies and build output are excluded. The hosting project ID is deliberately removed when exporting a ZIP so a new restoration does not overwrite the original website.

Upload this ZIP to ChatGPT and use RESTORE-WITH-CHATGPT.md. For future exports from a Git checkout, commit intended changes first, then run:

```sh
python3 scripts/export-source.py --output Blynk-Pulse-GitHub-Source.zip
```

Use Node 24 or later to run the audit. The application runtime requires Node 22.13 or later. Dependencies are pinned in pnpm-lock.yaml; the existing installer uses pnpm 11.25.0. In a managed Sites environment use its current project-setup and dependency-installation helpers with this sanitized source as the retained template. Outside that environment, install pnpm 11.25.0, run `pnpm install --frozen-lockfile`, then `pnpm exec tsc --noEmit --incremental false`, `node tests/audit.mjs`, and `pnpm build`.

The clean checkout's execution profile defaults to portable. The shell installer under scripts/install-pnpm.sh is intended for managed Linux and requires its exported runtime settings, flock and GNU timeout. Direct pnpm installation is the documented portable path. Do not copy the ignored execution profile or runtime state into a source backup.

The ZIP preserves executable modes. If extracting with Python's zipfile, apply each ZipInfo.external_attr Unix permission mode after extraction: Python's default extractall does not apply those modes. Verify SHA256SUMS.txt after extraction. Standard Unix unzip should retain the executable metadata.

Restore D1 binding DB and apply all included drizzle/*.sql migrations in their journal order to a fresh database through the Sites deployment workflow. The original database's shared reading and browser-held charts are not part of a code backup. Configure a fresh BLYNK_VAULT_KEY runtime secret (32 cryptographically random bytes, Base64 encoded) before deploying a new site. Saved tokens and the original encryption key are excluded; add each device in the owner-only Devices tab. Never replace an existing vault key during a normal redeployment. If restoring for another owner, change the server-only owner rule in lib/dashboard-access.ts to the verified authenticated owner's identity.

Public viewers can inspect data but cannot connect devices or write settings. Shared updates require the owner's connected dashboard to remain open and visible. Tests use controlled upstream responses, simulated React hooks and simulated platform identity; they do not prove live hardware or the hosting authentication boundary. See README.md and AUDIT-REPORT.md when supplied in the delivered backup.

A GitHub repository must contain this full directory, including .openai/hosting.json and all build integration files. A ZIP export alone does not create a GitHub repository. For private repositories, future ChatGPT sessions need access through the connected GitHub account; alternatively upload the ZIP directly.
