#!/usr/bin/env python3
"""Fast download of Bridge2AI torchaudio_spectrogram.parquet from PhysioNet.

PhysioNet file servers often return 403 instead of a 401 Basic-Auth challenge,
so wget/aria2 username+password never get sent. This script logs in through
the website (session cookie), then downloads with parallel Range requests.

Usage:
  python scripts/download_b2ai_spectrogram.py

  # if the site login username is not your email:
  python scripts/download_b2ai_spectrogram.py --user YOUR_PHYSIONET_USERNAME

  # if the browser can download it but the script cannot, paste sessionid:
  python scripts/download_b2ai_spectrogram.py --session-id PASTE_FROM_DEVTOOLS
"""

from __future__ import annotations

import argparse
import getpass
import http.cookiejar
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

URL = (
    "https://physionet.org/files/b2ai-voice/3.1.0/"
    "features/torchaudio_spectrogram.parquet"
)
LOGIN_URL = "https://physionet.org/login/"
DEFAULT_OUT = Path("data/b2ai-voice/torchaudio_spectrogram.parquet")
CHUNK = 1 << 20
USER_AGENT = "Wget/1.21.4 (linux-gnu)"


def _fmt(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.2f} {unit}"
        n /= 1024
    return f"{n:.2f} GB"


def _snippet(data: bytes, limit: int = 400) -> str:
    text = data.decode("utf-8", "replace")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def _candidate_users(user: str) -> list[str]:
    users = [user]
    if "@" in user:
        local = user.split("@", 1)[0]
        if local and local not in users:
            users.append(local)
    return users


def _cookie_header(jar: http.cookiejar.CookieJar) -> str:
    return "; ".join(f"{c.name}={c.value}" for c in jar)


def _opener(jar: http.cookiejar.CookieJar | None = None) -> urllib.request.OpenerDirector:
    handlers: list[urllib.request.BaseHandler] = []
    if jar is not None:
        handlers.append(urllib.request.HTTPCookieProcessor(jar))
    opener = urllib.request.build_opener(*handlers)
    opener.addheaders = [("User-Agent", USER_AGENT)]
    return opener


def login(user: str, password: str) -> http.cookiejar.CookieJar:
    jar = http.cookiejar.CookieJar()
    opener = _opener(jar)
    with opener.open(LOGIN_URL, timeout=60) as resp:
        page = resp.read().decode("utf-8", "replace")
    match = re.search(r'name="csrfmiddlewaretoken"\s+value="([^"]+)"', page)
    if not match:
        raise RuntimeError("Could not find CSRF token on PhysioNet login page.")
    body = urllib.parse.urlencode(
        {
            "csrfmiddlewaretoken": match.group(1),
            "username": user,
            "password": password,
            "next": "/",
        }
    ).encode()
    req = urllib.request.Request(
        LOGIN_URL,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": LOGIN_URL,
            "Origin": "https://physionet.org",
        },
    )
    with opener.open(req, timeout=60) as resp:
        html = resp.read().decode("utf-8", "replace")
        final = resp.geturl()
    logged_in = any(c.name == "sessionid" for c in jar)
    still_login = "/login" in final or 'name="password"' in html
    if not logged_in or still_login:
        raise PermissionError(f"Website login failed for {user}")
    print(f"Logged in as {user}")
    return jar


def probe(opener: urllib.request.OpenerDirector, url: str) -> tuple[int, bool]:
    req = urllib.request.Request(url, headers={"Range": "bytes=0-0", "Accept-Encoding": "identity"})
    try:
        with opener.open(req, timeout=60) as resp:
            cr = resp.headers.get("Content-Range")
            if cr and "/" in cr:
                return int(cr.rsplit("/", 1)[1]), True
            length = resp.headers.get("Content-Length")
            if length and int(length) > 1:
                return int(length), False
            raise RuntimeError("Could not determine file size.")
    except urllib.error.HTTPError as e:
        body = e.read() if e.fp else b""
        print(f"HTTP {e.code} {e.reason}", file=sys.stderr)
        if body:
            print(f"Server said: {_snippet(body)}", file=sys.stderr)
        raise


def download_aria2(url: str, dest: Path, cookie: str, connections: int) -> bool:
    aria2 = shutil.which("aria2c")
    if not aria2:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        aria2,
        f"--header=Cookie: {cookie}",
        f"--user-agent={USER_AGENT}",
        "--continue=true",
        "--allow-overwrite=true",
        "--auto-file-renaming=false",
        "--file-allocation=none",
        "--max-tries=0",
        "--retry-wait=2",
        f"-x{connections}",
        f"-s{connections}",
        "-k8M",
        "-d",
        str(dest.parent),
        "-o",
        dest.name,
        url,
    ]
    print(f"Using aria2c with {connections} connections")
    subprocess.check_call(cmd)
    return True


def download_ranges(
    opener: urllib.request.OpenerDirector,
    url: str,
    dest: Path,
    total: int,
    connections: int,
) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    if tmp.exists() and tmp.stat().st_size != total:
        tmp.unlink()
    if not tmp.exists():
        with open(tmp, "wb") as f:
            f.truncate(total)

    part = (total + connections - 1) // connections
    ranges: list[tuple[int, int]] = []
    start = 0
    while start < total:
        end = min(start + part - 1, total - 1)
        ranges.append((start, end))
        start = end + 1

    done = 0
    lock = threading.Lock()
    errors: list[BaseException] = []
    t0 = time.time()

    def worker(lo: int, hi: int) -> None:
        nonlocal done
        try:
            req = urllib.request.Request(
                url,
                headers={"Range": f"bytes={lo}-{hi}", "Accept-Encoding": "identity"},
            )
            with opener.open(req, timeout=120) as resp, open(tmp, "r+b") as f:
                if resp.status not in (200, 206):
                    raise RuntimeError(f"unexpected status {resp.status}")
                if resp.status == 200 and lo != 0:
                    raise RuntimeError("server ignored Range; retry with --connections 1")
                f.seek(lo)
                remaining = hi - lo + 1
                while remaining > 0:
                    buf = resp.read(min(CHUNK, remaining))
                    if not buf:
                        break
                    f.write(buf)
                    remaining -= len(buf)
                    with lock:
                        done += len(buf)
            if remaining > 0:
                raise RuntimeError(f"short read for range {lo}-{hi}")
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=r, daemon=True) for r in ranges]
    for t in threads:
        t.start()
    while any(t.is_alive() for t in threads):
        time.sleep(0.5)
        elapsed = max(time.time() - t0, 1e-6)
        speed = done / elapsed
        pct = 100.0 * done / total
        eta = (total - done) / speed if speed > 0 else 0
        print(
            f"\r{pct:6.2f}%  {_fmt(done)} / {_fmt(total)}  "
            f"{_fmt(speed)}/s  ETA {eta/60:.1f} min    ",
            end="",
            flush=True,
        )
        if errors:
            break
    for t in threads:
        t.join()
    print()
    if errors:
        raise errors[0]
    tmp.replace(dest)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("-o", "--output", type=Path, default=DEFAULT_OUT)
    p.add_argument("-c", "--connections", type=int, default=16)
    p.add_argument("--user", default=os.environ.get("PHYSIONET_USER", "nna67@sfu.ca"))
    p.add_argument(
        "--session-id",
        default=os.environ.get("PHYSIONET_SESSIONID", ""),
        help="sessionid cookie from a logged-in browser (DevTools → Application → Cookies)",
    )
    args = p.parse_args()
    dest = args.output

    if dest.exists() and dest.stat().st_size > 1_000_000_000:
        print(f"Already present: {dest} ({_fmt(dest.stat().st_size)})")
        return 0

    jar = http.cookiejar.CookieJar()
    if args.session_id:
        cookie = http.cookiejar.Cookie(
            version=0,
            name="sessionid",
            value=args.session_id.strip(),
            port=None,
            port_specified=False,
            domain="physionet.org",
            domain_specified=True,
            domain_initial_dot=False,
            path="/",
            path_specified=True,
            secure=True,
            expires=None,
            discard=True,
            comment=None,
            comment_url=None,
            rest={"HttpOnly": None},
            rfc2109=False,
        )
        jar.set_cookie(cookie)
        print("Using browser sessionid cookie")
    else:
        password = os.environ.get("PHYSIONET_PASSWORD") or getpass.getpass("PhysioNet password: ")
        last_err: Exception | None = None
        for user in _candidate_users(args.user):
            try:
                jar = login(user, password)
                break
            except PermissionError as e:
                print(str(e), file=sys.stderr)
                last_err = e
        else:
            print(
                "Website login failed. On https://physionet.org/settings/profile/ the "
                "username is often not your email. Copy the --user value from the wget "
                "command on the dataset Files box, or pass --session-id from the browser.",
                file=sys.stderr,
            )
            return 1
        _ = last_err

    opener = _opener(jar)
    urllib.request.install_opener(opener)
    print("Checking file access...")
    try:
        total, ranged = probe(opener, URL)
    except urllib.error.HTTPError:
        print(
            "\nLogin worked or cookie was sent, but the file is still forbidden.\n"
            "Open this URL while logged in and confirm the file name is a download, not HTML:\n"
            f"  {URL}\n"
            "If the browser can download it, copy sessionid from DevTools cookies and run:\n"
            "  python scripts/download_b2ai_spectrogram.py --session-id YOUR_SESSIONID",
            file=sys.stderr,
        )
        return 1

    print(f"{_fmt(total)}  range-support={ranged}")
    n = args.connections if ranged else 1
    cookie = _cookie_header(jar)
    try:
        if download_aria2(URL, dest, cookie, n):
            print(f"Saved {dest}")
            return 0
    except subprocess.CalledProcessError:
        print("aria2c failed; falling back to Python Range downloader", file=sys.stderr)

    t0 = time.time()
    download_ranges(opener, URL, dest, total, n)
    dt = time.time() - t0
    print(f"Saved {dest} in {dt/60:.1f} min ({_fmt(dest.stat().st_size / max(dt, 1))}/s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
