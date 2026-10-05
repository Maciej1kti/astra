# ADR-068 — Connection bounds, background recovery and definite source refusals

Status: accepted on the owner's 2026-10-05 direction to complete the review fixes.

The second pass over the repository review resolved its remaining server
findings. Each behavior change below started from a regression that failed for
the reviewed reason. [ADR-066](ADR-066-DEFINITE-OUTCOMES-AND-ADMISSION.md) and
[ADR-067](ADR-067-REVIEWED-INTENT-RESOLUTION.md) remain in force.

## Connections

`axum::serve` accepts without a limit and builds its HTTP/1 connections without
a timer, so hyper's request-head timeout never ran: a peer that connected and
sent nothing held a task and a descriptor indefinitely. Both listeners now use
one accept path that holds a permit for every open connection and closes one
that does not deliver a complete request head in time.

| Listener | Open connections | Request head / idle deadline |
| --- | ---: | ---: |
| Network (loopback, behind the proxy) | 96 | 150 s |
| Local socket | 32 | 30 s |

Together the limits stay at half of the 256-descriptor soft limit macOS gives a
process. Excess peers wait in the kernel backlog. The deadline also bounds an
idle kept-alive connection; open responses, including event streams, are not
timed. A proxy's upstream idle timeout should stay below 150 seconds so the
proxy retires a pooled connection first. `hyper`, `hyper-util` and
`tower-service` become direct, exact-pinned dependencies of `projectd`; all
were already locked.

Request admission, body limits and timeouts stay in the request handler. A
refused request releases its admission and has its body discarded before the
reply, as recorded in ADR-066.

## An unacceptable source before an intent exists

A collection entry or source that exists in a form the store refuses — a
non-canonical name, a link or special file, an oversized file, a non-UTF-8 name
or too many entries — failed card creation, reordering, pin admission and
card/report deletion as `503`. While a command has no intent, these conditions
are now the recorded `409 DOCUMENT_INVALID`, the code the same scan already
uses for an invalid sibling. A changed directory, a replaced lease, I/O errors
and anything after an intent keep their existing handling, and nothing is
mapped at the transport. This supersedes ADR-066's sentence that a store-level
`INVALID_ID` keeps its handling.

## Read receipts

A receipt is removed in the journal transaction that commits its report
deletion, project deletion or unregistration. Retention also removes up to 500
receipts per pass whose project is no longer registered, and never runs without
a readable workspace. A Focus cursor issued while such rows existed becomes
`PAGE_STALE` once they are removed. In a shared project, another profile's
receipt for a report deleted through a different profile remains until that
profile unregisters the project; existence of the source is not used, because a
checkout of another branch would erase read state.

## Background work

- A profile's watcher task that ends or panics is recorded as
  `user_watcher_stopped` and restarted after 2 seconds, doubling to 5 minutes.
- Each profile runs retention 30 seconds after start as well as on the
  15-minute reconciliation, so a host restarted often still prunes its journal.
- Every 30 seconds each profile retries its own journal's `prepared` and
  `blocked` source intents with the startup rules. A shared project therefore
  no longer waits for the owning profile to write or for a restart.
  `needs_review`, workflows and project deletion are untouched.

## Plans

A commit refuses an expired or stale plan before opening any store, so it
creates no `.project/.local` and takes no lease; this check now precedes
`PROJECT_RECOVERY_REQUIRED`. A relocation preview only reads; the commit
releases the previous store and leases the new one. A job status read takes its
two plan fields in SQL instead of parsing every step's bytes. The saved plan
format is unchanged: its byte arrays are a tested compatibility contract.

## Panics and structure

Non-test Rust in every crate also rejects `unreachable!`, `panic!`, `todo!` and
`unimplemented!`. A malformed counter shape is an error instead of a panic. The
workspace gate and project store are taken through `Engine::shared_gate`,
`exclusive_gate` and `lock_store`; the dispatcher is split into per-area route
functions with one structural check for local routes; a route path needs
exactly one leading slash.

## Not changed

Pin admission still validates every registered project's cards under the
exclusive gate, and the pairing rate limit stays per instance; both are recorded
in [limitations](LIMITATIONS.md#source-and-state-bounds). Response write time
to a slow reader is not bounded. The new accept path was exercised by daemon
tests and the browser suites through the test proxy, not by a production proxy
or near real descriptor exhaustion.
