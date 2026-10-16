# Independent server connection update

This backup now includes support for blynk.allmixedupocean.net:8080. Read the Independent Blynk server section in README.md.

The prior AUDIT-REPORT.md is preserved as historical evidence for version 3. It predates this server correction. Current adapter verification: 27 controlled checks, TypeScript and production build passed. A real read-only request with a dummy token returned HTTP 400 Invalid token, confirming the legacy API answered. No valid local-server token or live device readings were available. Full actual project discovery remains unverified. Port 8080 uses unencrypted HTTP; the connection form explains this before token entry.

The changed adapter was tested and built, but the full clean-restoration experiment was not repeated for this connection-only update. The earlier clean restore applies to the version 3 source described in the historical report.
