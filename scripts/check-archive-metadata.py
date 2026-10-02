#!/usr/bin/env python3
"""Inspect a release tarball without extracting or executing its contents."""
import argparse
import hashlib
import json
import tarfile
from pathlib import Path

# These describe tar paths, ownership, timestamps or text encoding, not host xattrs.
FORMAT_PAX_KEYS = {
    "path", "linkpath", "size", "uid", "gid", "uname", "gname",
    "mtime", "atime", "ctime", "charset", "hdrcharset",
}


def inspect_archive(path):
    files, directories, issues, pax_keys, seen = [], [], [], set(), set()
    apple_double = 0
    root_apple_double = 0
    with tarfile.open(path, "r:gz") as archive:
        members = archive.getmembers()
        for member in members:
            name = member.name
            parts = name.rstrip("/").split("/")
            if any(part.startswith("._") for part in parts):
                apple_double += 1
                root_apple_double += int(len(parts) == 1)
                issues.append(f"AppleDouble entry: {name}")
            if (parts[0] != "tenet" or any(part in {"", ".", ".."} for part in parts)
                    or "\\" in name or (len(parts) == 1 and not member.isdir())):
                issues.append(f"unsafe archive path: {name}")
            if name in seen:
                issues.append(f"duplicate archive entry: {name}")
            seen.add(name)
            if member.isfile():
                files.append(name)
            elif member.isdir():
                directories.append(name)
            else:
                issues.append(f"link or special archive entry: {name}")
            pax_keys.update(member.pax_headers)
            for key in sorted(set(member.pax_headers) - FORMAT_PAX_KEYS):
                issues.append(f"filesystem or unsupported PAX metadata: {name}: {key}")
        # Include global headers even when they have no following application entry.
        pax_keys.update(archive.pax_headers)
        for key in sorted(set(archive.pax_headers) - FORMAT_PAX_KEYS):
            issues.append(f"filesystem or unsupported global PAX metadata: {key}")
    return {
        "archive": str(path),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "rawEntries": len(members),
        "appleDoubleEntries": apple_double,
        "rootAppleDoubleEntries": root_apple_double,
        "nestedAppleDoubleEntries": apple_double - root_apple_double,
        "paxKeys": sorted(pax_keys),
        "files": sorted(files),
        "directories": sorted(directories),
        "issues": issues,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    try:
        report = inspect_archive(args.archive)
    except (OSError, tarfile.TarError) as error:
        parser.exit(1, f"archive inspection failed: {error}\n")
    print(json.dumps(report, indent=2))
    return 1 if report["issues"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
