# Stopped-server copy and recovery

Built-in archives and source-file migrations are deferred beyond v1. Use your
existing external backup system to keep copies on independent storage.

Before copying:

1. Stop external edits to registered `.project` folders.
2. Run `projectctl --socket SOCKET doctor`. Resolve pending operations and jobs.
3. Stop `projectd` cleanly and verify that the process has exited.
4. Copy each registered `.project` directory, excluding `.local`, plus the entire
   server data directory. Keep `workspace.json`, `roots.json`, `state.sqlite` and
   any `state.sqlite-wal`/`state.sqlite-shm` files together. Include your service
   configuration. The search index is disposable.
5. Restrict access to the copied files: directories 0700, files 0600. These contain
   private project data. Do not commit them into the public application repository.

To recover a quiescent copy on the same host:

1. Stop the server and external editors. Keep the current data separately so an
   incorrect choice of copy can be reversed.
2. Restore project sources and server state to the same absolute paths. Do not
   combine a newer operational database with older project files.
3. Remove only disposable `index.sqlite`, `index.sqlite-wal`, `index.sqlite-shm`
   and a leftover `projectd.sock` from the restored server data directory.
4. Start `projectd --data-dir DATA --public-origin HTTPS_ORIGIN --after-restore`.
   This one-time flag changes the command epoch and revokes old browser sessions.
   Remove it from subsequent starts. Pair browsers again.
5. Run `doctor`, inspect project availability and open a known card. The server
   rebuilds its index from the source files. Review pending/recovery diagnostics
   before making new changes. Do not blindly retry old uncertain commands.

Approved browser roots retain directory identities. A replaced root may require
removing its old approval and adding the restored directory explicitly. Recovery
onto different paths or a different host requires explicit registration/location
handling; copying the old workspace paths alone is insufficient.

This procedure does not snapshot concurrently edited files. Database versioning
only upgrades actual operational layouts; future source schemas are rejected
without rewriting source files. A successful process-stop test does not establish
physical power-loss resilience or backup-device durability.
