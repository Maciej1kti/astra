# Security reporting

Astra is under active implementation; a supported release and security-update
policy have not been declared. The maintainer must publish a private reporting
channel before the supported public release. None is currently documented here.

Do not include credentials, session tokens, private project documents or a
working sensitive exploit in a public issue. Public issues may describe a
sanitized symptom and affected revision. For sensitive details, request a private
contact from the maintainer before sharing them.

For the implemented trust boundaries, see the [security design](docs/07-SECURITY.md).
The daemon is intended for loopback access behind an owner-managed private HTTPS
proxy. Packaging does not install or configure a public service automatically.
