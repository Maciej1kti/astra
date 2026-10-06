# Security reporting

Astra is under active implementation; a supported release and security-update
policy have not been declared. The maintainer must publish a private reporting
channel before the supported public release. None is currently documented here.

Do not include credentials, session tokens, private project documents or a
working sensitive exploit in a public issue. Public issues may describe a
sanitized symptom and affected revision. For sensitive details, request a private
contact from the maintainer before sharing them.

For implemented trust boundaries, see the
[architecture overview](docs/ARCHITECTURE.md#security-and-operations-boundaries)
and the [detailed security requirements](docs/07-SECURITY.md).
The daemon is intended for loopback access behind an owner-managed private HTTPS
proxy. Packaging does not install or configure a public service automatically.
An owner can additionally start it with `--agent-dir`, which lets paired browsers
instruct a local coding agent that runs without permission prompts or a sandbox
with the daemon user's rights; the option is off by default. See
[ADR-070](docs/ADR-070-AGENT-RUNS.md) and its
[limitations](docs/LIMITATIONS.md#in-app-agent).

## Dependency advisories

[Dependency advisory scan](.github/workflows/dependencies.yml) runs each Monday
at 07:23 UTC, on dependency/scan-workflow changes in pushes and pull requests, and
on manual dispatch. It uses the pinned official
[OSV workflow](https://google.github.io/osv-scanner/github-action/) to scan the
exact npm, Cargo and validation-tool Python lockfiles. It does not install project
dependencies, run their scripts, update versions or resolve new dependencies.
The Python lockfile uses an explicit requirements parser because of its name.

Findings fail the check and appear under Actions and Security > Code scanning;
scan/service failures also fail and are not a clean result. Scheduled jobs depend
on GitHub Actions availability and can be delayed. The local full gate remains
independent of advisory-service availability.

Triage a finding by checking the pinned affected version, runtime versus tooling
use, upstream fix and actual exposure. Update the smallest necessary dependency
set, preserve lockfiles and run appropriate checks before integration. Do not
silently suppress a finding or use automatic force upgrades. Any justified
temporary exception needs a recorded reason and review date. A clean scan only
means no matching published advisory was returned, not a security guarantee.

To reproduce with OSV-Scanner 2.6.0:

```sh
osv-scanner scan source --no-resolve \
  --lockfile=package-lock.json \
  --lockfile=Cargo.lock \
  --lockfile=requirements.txt:scripts/requirements-validation.lock
```
