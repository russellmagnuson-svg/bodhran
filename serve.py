#!/usr/bin/env python3
"""Local server for working on the Bodhrán app.

The same as `python3 -m http.server`, except it tells the browser not to cache
anything. Plain http.server sends no cache headers, so the browser guesses how
long to keep each file — and can go on running an old copy of a script you have
just edited, so a change to js/patterns.js appears to do nothing.

    python3 serve.py          # http://localhost:8777
    python3 serve.py 9000     # another port

It serves the folder this file lives in, so it works from any directory.
"""
import functools
import http.server
import pathlib
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
ROOT = pathlib.Path(__file__).resolve().parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


handler = functools.partial(NoCacheHandler, directory=str(ROOT))
with http.server.ThreadingHTTPServer(('', PORT), handler) as server:
    print(f'Serving on http://localhost:{PORT}  (Ctrl+C to stop)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
