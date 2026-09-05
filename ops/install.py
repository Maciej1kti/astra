#!/usr/bin/env python3
"""Install packaged binaries and generate a user-service file; never starts services."""
from pathlib import Path
import argparse
import os
import plistlib
import shutil
import stat
import sys
import tempfile
from urllib.parse import urlsplit


def atomic_copy(source: Path, target: Path):
    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as output:
        temporary = Path(output.name)
        with source.open('rb') as stream:
            shutil.copyfileobj(stream, output)
        output.flush()
        os.fchmod(output.fileno(), 0o755)
        os.fsync(output.fileno())
    os.replace(temporary, target)


def install(package: Path, prefix: Path, data: Path, origin: str, port: int):
    parsed = urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError('Use an HTTPS origin without a path, query or credentials')
    if len(os.fsencode(data / 'projectd.sock')) > 100:
        raise ValueError('Choose a shorter data directory for the Unix socket')
    data.mkdir(mode=0o700, parents=True, exist_ok=True)
    mode = data.lstat()
    if not stat.S_ISDIR(mode.st_mode) or mode.st_uid != os.getuid() or stat.S_IMODE(mode.st_mode) != 0o700:
        raise ValueError('The data directory must be an owner-only directory (0700)')
    binaries = prefix / 'bin'
    binaries.mkdir(parents=True, exist_ok=True)
    for name in ('projectd', 'projectctl'):
        atomic_copy(package / 'bin' / name, binaries / name)
    arguments = [str(binaries / 'projectd'), '--data-dir', str(data), '--public-origin', origin, '--port', str(port)]
    service_dir = prefix / 'share' / 'local-projects'
    service_dir.mkdir(parents=True, exist_ok=True)
    if sys.platform == 'darwin':
        service = service_dir / 'local.projects.projectd.plist'
        service.write_bytes(plistlib.dumps({'Label': 'local.projects.projectd', 'ProgramArguments': arguments, 'RunAtLoad': True, 'KeepAlive': {'SuccessfulExit': False}, 'ThrottleInterval': 3, 'Umask': 0o077}))
    else:
        def quote(value):
            return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%').replace('$', '$$') + '"'
        service = service_dir / 'projectd.service'
        service.write_text('[Unit]\nDescription=Local Projects user service\nAfter=network.target\n\n[Service]\nType=simple\nExecStart=' + ' '.join(map(quote, arguments)) + '\nRestart=on-failure\nRestartSec=3\nTimeoutStopSec=30\nUMask=0077\nNoNewPrivileges=true\n\n[Install]\nWantedBy=default.target\n')
    return service


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prefix', type=Path, default=Path.home() / '.local')
    parser.add_argument('--data-dir', required=True, type=Path)
    parser.add_argument('--public-origin', required=True)
    parser.add_argument('--port', type=int, default=47831, choices=range(1, 65536), metavar='PORT')
    args = parser.parse_args()
    service = install(Path(__file__).resolve().parent, args.prefix.expanduser().resolve(), args.data_dir.expanduser().absolute(), args.public_origin, args.port)
    print(f'Installed binaries. Generated service: {service}')
    print('No service was started. Configure your private HTTPS proxy, then review and enable the user service.')
