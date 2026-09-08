# Development tools

`check.py` runs the complete local gate in dependency order: contracts and package
references, Python/JavaScript tests, frontend checks/build, formatting, Clippy,
Rust tests and the release build. It does not establish device or browser coverage.

`check_package.py` validates contracts, examples, requirement/test/task references,
Markdown links, SQLite initialization and deployment template syntax. Its small
fixture parser is not the production source parser. It does not start services.

`generate_api_schema.py` and `generate-contracts.mjs` generate schema-derived
representations; their check modes catch drift. `assemble_spec.py` combines
retained requirement chapters into ignored `test-results/docs/MASTER-SPEC.md`.

`try.mjs` starts a manual synthetic fixture; `try-pair.mjs` approves an exact
owner-provided pairing challenge. [Browser tests](browser/README.md) use temporary
fixtures and the real pairing/transport flow.

`package.py` builds a host archive from release binaries under ignored `dist/`.
`release-smoke.py` verifies a package in a temporary prefix. Neither publishes a
GitHub release nor installs a persistent service on the development host.

See [Contributing](../CONTRIBUTING.md) for focused checks and evidence policy.
