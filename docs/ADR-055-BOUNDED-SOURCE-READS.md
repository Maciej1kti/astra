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
