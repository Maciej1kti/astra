# ADR-055: Bounded parallel source collection reads

Status: accepted implementation optimization, 2026-09-30.

Source-dependent creation reads current collection documents before preparing a
write. At 1,000 cards, sequential guarded filesystem reads remain a material
cost after removing duplicate lease path traversal. The source collection helper
can split large collections into contiguous sorted batches.

Collections below 256 recognized source filenames remain sequential. Larger
collections use at most four workers, capped by available CPU parallelism. A
process-wide nonblocking capacity guard permits only one such batch operation;
contention immediately uses ordinary sequential reads. There is no new queue,
retained thread pool, background scan or unbounded task creation. Failure to
start a worker reads that batch synchronously.

The calling application operation retains its workspace/project locks and lease
ownership. Scoped workers borrow the same collection reader and cannot outlive
it; they never acquire those application locks again. Every file retains its
ordinary lease, approved project/collection ancestry, no-follow, type, link,
size, parsing and byte-version checks. There is no source, inode, pathname or
version cache.

All workers are joined before returning. Batch results are joined in original
sorted filename order, retaining the first source error. No partial collection
is published. Worker panic becomes a private invariant failure after joining;
thread-start pressure retains the guarded synchronous path. Cancellation does
not detach workers or change an admitted command's outcome rules.

This only schedules independent read/validation work. Writer admission,
reference/version rechecks, authorization and prepare/write/commit durability
remain unchanged. Source formats, API schemas and protocol behavior do not
change. The existing server admission limit remains in effect.

Tests cover ordered values/current external byte versions, first-error ordering
with an unsafe later source and the contended sequential path. Release timing,
tail variability, memory and verification limits are recorded in
[the performance evidence](../progress/2026-09-30-parallel-source.md).

## Ordered tolerant tag scans

Tag catalogs and workspace rename previews keep their tolerant source behavior:
invalid cards produce ordered partial-result issues while readable neighbors are
visited. Their independent file reads use the same process-wide capacity guard,
with up to four scoped workers at 64 readable filenames. Smaller scans and
capacity contention stay sequential; the strict collection threshold remains 256.

Each worker traverses every fourth input and sends results through a capacity-one
channel. The caller consumes channels in original input order. At most two
results per worker (queued/current) and the consumer's result are held: nine
source observations at four workers, independent of the 50,000-file scan bound.
There is no full parsed collection or persistent worker pool for a tolerant scan.
Failed thread starts use the caller for that partition. Receivers are closed
before joining after an early visitor failure or worker panic, so blocked senders
terminate; all workers finish before the application locks or reader are released.

The workspace gate and the current project's lock remain with the caller;
projects are still processed sequentially. Every readable file keeps the same
guarded collection parser and exact byte version. The sorted filename prefix is
bounded before validity filtering, so invalid identifiers still count toward the
50,000-file budget. They avoid worker dispatch and retain their position among
card errors. The 500 detailed issues/omitted count, 500 preview proposals, literal
labels, archived sources and incomplete counts remain unchanged.

Tests cover ordered/limited in-flight observations, early failure cleanup, worker
panic, shared-capacity fallback, fresh external source versions, unsafe/malformed
neighbors and the actual 50,000-file/500-issue boundary. This is read scheduling;
it adds no source authority, protocol field or write exception.
Release comparison and coverage limits are in
[the ordered tag-read evidence](../progress/2026-09-30-tag-parallel-reads.md).

## Strict streaming pin discovery

Source-backed pin discovery uses `visit_collection` to consume ordinary guarded
card reads through the same bounded ordered visitor. It recognizes exactly the
strict collection helper's UUID-parsable `.json` filenames; noncanonical UUIDs
still reach ordinary identifier validation. Missing collections remain distinct
from missing or replaced leases. At 64 recognized filenames it can use the shared
scoped workers; smaller scans, contention and failed starts retain guarded caller
reads. Existing callers that need the complete collection keep their 256-file
batch threshold.

Each project retains only at most 101 pin ID/position pairs, including archived
pins, instead of every parsed card body. The caller still validates the complete
project before checking the cumulative 50,000-card limit and then the 100-pin
limit. A sorted source error therefore precedes either limit in that project,
and a source-count error precedes pin overflow. Projects retain their registration
order and locks; local position/ID order and stable workspace ranking remain.
There is no early success after filling the pin list, cached source membership,
new source authority or change to command durability.

Regression coverage includes external source membership and exact byte versions,
scoped/archived ordering, malformed and unsafe neighbors after pin overflow,
noncanonical identifiers, replaced leases and the actual 50,001/50,000-source
and 101/100-pin boundaries. Release context measurements establish substantially
lower temporary allocation, with a small latency tradeoff rather than a speedup;
see [the pin-read evidence](../progress/2026-10-01-source-focus-stream.md).
