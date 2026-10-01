# CLI runtime startup probe — 2026-10-01

Outcome: the single-thread client runtime prototype is rejected and restored.
The application remains the verified `a6bd6eb03af70f9a882dc0c89f26ce820a570b58`,
published with `b084885610bc4ab0887f2299206a52dfb22839e7`. The existing manual
instance remains unchanged. This iteration changes evidence only; broader
perceived performance and release acceptance remain open.

M4/macOS 27 arm64, Rust 1.92, Node 24.11, ten available logical CPUs and no
TOKIO_WORKER_THREADS override. Saved release binaries compare the default CLI
runtime with `current_thread`; the daemon runtime is unchanged. An ordinary
release host and UID-authenticated Unix API serve synthetic sources. Each profile
has two warmups and 100 measured matched pairs, alternating order. A quiet repeat
reverses the starting order. No builds/tests/browser profiling run alongside the
comparisons. Timings include process startup and complete stdout.

| Profile | First control → prototype median | Quiet repeat |
| --- | --- | --- |
| Help | 1.989 → 1.824 ms | 1.972 → 1.829 ms |
| Hello | 2.093 → 1.973 ms | 2.067 → 1.975 ms |
| Focus preview | 2.280 → 2.180 ms | 2.271 → 2.159 ms |
| Focus snapshot | 2.301 → 2.160 ms | 2.278 → 2.175 ms |
| Current card source | 2.300 → 2.171 ms | 2.275 → 2.168 ms |
| Explicit project context | 3.190 → 3.067 ms | 3.199 → 3.056 ms |

All 2,400 selected observations retain native result checks, including exact card
source content/metadata/version, Focus order/membership/version, the explicit project
context identity/version and unchanged help output. The first exploratory context
oracle incorrectly expected nested metadata; it is corrected to the existing
flattened context entry without changing the application. The complete series
and repeat use that corrected oracle. Raw measurements, failure output, saved
binaries and the rejected diff stay in ignored `test-results/cli-runtime-2026-10-01/`.

The repeatable median saving is only approximately 0.09–0.16 ms. This does not
establish a perceptible application benefit, a command/write performance claim
or a universal tail improvement. The source file is restored exactly; no retained
code, new full-gate/browser/device result or application restart is claimed.
Documentation/package validation passes. The normal CLI result report is committed
and read back, preserving the unrelated owner card edit.

The next source-read investigation is supported by current code:
`Engine::source_focus_in` retains the complete parsed card collection, including
bodies, before selecting pin references. Reducing that temporary memory while
preserving every validation, bound, source version and sorted first-error rule
may have a larger benefit than further client startup tuning. It is not yet a
measured or accepted implementation change.
