# Manual tailnet access — 2026-09-23

The manual launcher now accepts `ASTRA_TRY_TAILSCALE_IP` and verifies that it
matches the Mac's current Tailscale IPv4 address. It binds the HTTPS test proxy
to that address, includes the IP in a separate self-signed certificate, and
sets the daemon's public origin to the same URL. The default localhost mode is
unchanged. Browser pairing remains required for each device.

The Mac-side manual check served `https://100.122.250.14:47832/` with HTTP 200;
the proxy listened only on that Tailscale IP and the daemon still listened only
on loopback. The certificate SAN contained the Tailscale IP, and the CLI `hello`
request succeeded against the retained `.manual/` state. `node --check` and
Prettier passed. The full local gate passed package checks, 12 Python and 98
JavaScript tests, frontend typing, formatting, the frontend build and bundle
budget, then stopped at Clippy because the existing macOS application test uses
`rustix::fs::mkfifoat`, which is unavailable in this build. No phone connection
or browser pairing has been observed yet.

On 2026-09-24, restarting the Mac manual host with Homebrew Node 26.0.0 made
TCP connections to the HTTPS proxy succeed but left the TLS handshake waiting,
including requests made on the Mac itself. Restarting the same build and state
with the Mac's existing Node 22.16.0 restored HTTP 200 from both Mac Mini and
Linux. The daemon CLI remained healthy, including all three Focus cards. The
manual Mac launcher currently needs Node 22.16.0 first on `PATH`; the exact
cause of the Node 26 TLS stall was not established. No network setting changed.
