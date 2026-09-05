#!/usr/bin/env python3
"""Exercise a host archive, temporary install and stopped-server copy recovery."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
archive = Path(sys.argv[1]).resolve()
expected = archive.with_suffix(archive.suffix + '.sha256').read_text().split()[0]
assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected
with tempfile.TemporaryDirectory(prefix='lp-release-', dir='/tmp') as temporary:
    root = Path(temporary).resolve()
    with tarfile.open(archive) as stream:
        stream.extractall(root, filter='data')
    package = next(root.glob('local-projects-*'))
    prefix, state, project = root / 'prefix with spaces', root / 'state', root / 'project'
    project.mkdir(mode=0o700)
    install = [sys.executable, str(package / 'install.py'), '--prefix', str(prefix), '--data-dir', str(state), '--public-origin', 'https://projects.test']
    subprocess.run(install, check=True, stdout=subprocess.PIPE)
    subprocess.run(install, check=True, stdout=subprocess.PIPE)
    assert not (state / 'state.sqlite').exists(), 'Installer must not start the service'
    assert state.stat().st_mode & 0o777 == 0o700
    for binary in ('projectd', 'projectctl'):
        assert hashlib.sha256((prefix / 'bin' / binary).read_bytes()).digest() == hashlib.sha256((package / 'bin' / binary).read_bytes()).digest()
    daemon = None
    log = (root / 'daemon.log').open('w+')
    def cli(*args, expected_exit=0):
        result = subprocess.run([str(prefix / 'bin/projectctl'), '--socket', str(state / 'projectd.sock'), *map(str, args)], capture_output=True, text=True, timeout=20)
        assert result.returncode == expected_exit, (args, result.returncode, result.stdout, result.stderr)
        envelope = json.loads(result.stdout)
        assert envelope['api_version'] == '1'
        return envelope
    def start(restored=False):
        global daemon
        daemon = subprocess.Popen([str(prefix / 'bin/projectd'), '--data-dir', str(state), '--public-origin', 'https://projects.test', '--port', '0', *(['--after-restore'] if restored else [])], stdout=log, stderr=log)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            assert daemon.poll() is None, 'Daemon exited during startup'
            if (state / 'projectd.sock').exists():
                try:
                    cli('hello')
                    return
                except (AssertionError, subprocess.TimeoutExpired):
                    pass
            time.sleep(0.05)
        raise AssertionError('Daemon did not become ready')
    def stop():
        global daemon
        if daemon is not None and daemon.poll() is None:
            daemon.terminate()
            try:
                assert daemon.wait(timeout=15) == 0
            except BaseException:
                daemon.kill()
                daemon.wait()
                raise
        daemon = None
    try:
        start()
        plan = cli('registration-plan', project, '--name', 'Recovery fixture')['data']
        accepted = cli('register', plan['plan_id'], expected_exit=9)['data']
        assert cli('get', '/api/v1/jobs/' + accepted['job_id'])['data']['state'] == 'done'
        old_epoch = cli('hello')['data']['command_epoch']
        request = str(uuid.uuid7())
        cli('--project', project, 'card', 'create', '--title', 'Copied card', '--request-id', request, '--epoch', old_epoch)
        card = cli('--project', project, 'cards')['data']['items'][0]
        card_file = project / '.project/cards' / (card['id'] + '.md')
        source = card_file.read_bytes()
        assert cli('doctor')['data']['pending_commands'] == 0
        stop()
        saved = root / 'quiescent-copy'
        saved.mkdir()
        shutil.copytree(state, saved / 'state')
        shutil.copytree(project / '.project', saved / 'sources', ignore=shutil.ignore_patterns('.local'))
        start()
        cli('--project', project, 'card', 'create', '--title', 'Newer data')
        assert len(cli('--project', project, 'cards')['data']['items']) == 2
        stop()
        # Everything below is a disposable fixture, never a user directory.
        shutil.rmtree(state)
        shutil.rmtree(project / '.project')
        shutil.copytree(saved / 'state', state)
        shutil.copytree(saved / 'sources', project / '.project')
        for name in ('index.sqlite', 'index.sqlite-wal', 'index.sqlite-shm', 'projectd.sock'):
            (state / name).unlink(missing_ok=True)
        start(restored=True)
        epoch = cli('hello')['data']['command_epoch']
        assert epoch != old_epoch
        assert card_file.read_bytes() == source
        recovered = cli('--project', project, 'cards')['data']['items']
        assert len(recovered) == 1 and recovered[0]['id'] == card['id']
        rejected = cli('--project', project, 'card', 'create', '--title', 'Copied card', '--request-id', request, '--epoch', old_epoch, expected_exit=5)
        assert rejected['ok'] is False
        assert cli('doctor')['data']['pending_commands'] == 0
        stop()
        start()
        assert cli('hello')['data']['command_epoch'] == epoch
        assert card_file.read_bytes() == source
        print('PASS: archive checksum, repeat installation with spaces, no auto-start, packaged daemon/CLI, graceful stop/restart, quiescent copy recovery, index rebuild and old-epoch rejection.')
        print('Temporary fixture only; no service enablement, private-network setup or physical power-loss claim.')
    finally:
        stop()
        log.close()
