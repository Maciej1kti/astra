# ADR-052: Bounded compression of summary reads

Status: accepted implementation optimization, 2026-09-30.

A release desktop Calendar profile transfers 344 KB of JSON for 1,000 scheduled
cards. At 6 Mbps and 100 ms latency, transfer alone takes about 560 ms before the
browser performs its own substantial rendering work. Static assets already have
build-time gzip; authenticated API summaries previously used only identity.

Negotiate optional gzip for successful GETs of `/api/v1/views/*`, the project
collection, card/milestone/report collections and workspace Focus. Selection is
explicit at the dispatch boundary, after authentication and application query
locks are released. Compression uses the existing admitted blocking worker and
eight-request semaphore; it creates no new task queue, process, cache or stream.
The pinned `flate2` implementation uses the pure Rust `miniz_oxide` backend with
runtime CRC feature detection and fast compression, without a C/zlib service.

Missing or empty `Accept-Encoding` uses identity. Explicit gzip/identity qualities,
multiple header lines and wildcard vetoes use the same parser as static assets.
For ordinary clients, compress only 1 KiB through 4 MiB of serialized JSON, only
when gzip is preferred and the result is smaller. A client forbidding identity
can receive gzip for a smaller body; the 4 MiB input cap still applies. If neither
available representation is acceptable, return controlled 406
`ENCODING_NOT_ACCEPTABLE`, without changing source data. Oversize responses retain
their existing identity behavior when permitted. This bounds additional encoding
work, not the independently bounded source/view contract.

All negotiated responses include `Vary: Accept-Encoding` and retain `no-store`.
Compressed responses retain `application/json`, carry `Content-Encoding: gzip`
and the encoded `Content-Length`. Decompression preserves the exact JSON bytes,
resource versions, cursors, freshness and warnings. Browser fetch decodes the
response normally; CLI/older clients requesting no encoding continue receiving
identity. No endpoint or older-host fallback is removed.

Source resources with strong ETags remain identity; compression never reuses an
identity validator for different representation bytes. Enriched Focus already has
no representation ETag, and its conditional source version remains unchanged.
Bootstrap, pairing/authentication, credentials, mutations/command results, command
status, diagnostics, local administrative reads and SSE remain outside the
compression boundary. A future endpoint must explicitly qualify for this boundary;
having JSON is insufficient. See [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.3)
for negotiation and representation semantics.

Tests cover byte-equivalent decoding, Unicode/version preservation, quality vetoes,
threshold/cap behavior, 406, normal authenticated HTTP/Unix reads, unchanged source
ETags and identity credentials/command responses. Existing static-asset, session,
source conflict and write durability coverage remains required. Release loading
measurements, dependency review and device limits are recorded in
[the performance evidence](../progress/2026-09-30-deep-performance.md).
