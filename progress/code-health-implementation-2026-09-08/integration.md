# CLI and regression infrastructure

The CLI uses named requests with explicit read, local operation, versioned command
and maintenance semantics. Preliminary hello/project/report reads and final
responses share a 16 MiB decoder. Structured API errors keep their code, details,
HTTP status and exit classification across phases. Mutation transport failures
keep the original command identity and remain uncertain; tag preview remains a
read-only POST without admission headers.

The new CLI regression was run before the fix and failed because preliminary
hello converted `PROJECT_RECOVERY_REQUIRED` to generic `CONFLICT`. After the fix,
the CLI command-tree test and six integration tests pass. Malformed error envelopes
also produce a structured `INVALID_RESPONSE`, or `RESULT_UNCERTAIN` with the
original identity when a command may have reached the server. Further full-workspace
verification is recorded separately at integration completion.

Browser infrastructure now shares temporary host/proxy lifecycle and provides
fresh normally paired fixtures for maintained card, tag, editor, dialog, planning and request-scope
regressions. Dated entry points delegate to stable scripts, and the main browser
smoke/planning suites reuse host setup. CI invokes all eight browser suites against
release binaries and includes the eight Omarchy Python helper tests in static checks.

New bulk output defaults to ignored `test-results/browser/`, includes checksum
manifests, and is uploaded by CI with 90-day retention. Existing acceptance images
are retained rather than deleting historical references; no Git history rewrite or
new external artifact service is introduced. The package checker excludes ignored
browser output and local runtime state.

An integrated browser regression exposed a calendar layout shift: the loading
message moved the grid and the temporary read-only state removed resize handles.
The loading indicator now overlays the grid without intercepting pointers; retained
versioned rows remain interactive during same-scope reads, while scope changes
disable obsolete rows. Selection helpers without application metadata also render
safely. The planning suite now holds a real read across a resize, asserts stable
geometry, and exercises blank-range creation, both resize edges and cancellation.

Final execution results are recorded in the implementation README. No physical
device acceptance is implied. Unused direct Serde dependencies and a repeated UUID
dependency declaration were removed without changing resolved dependency versions.
