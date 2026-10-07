"""BOXFLOW local dev server — like `python -m http.server` but never cached, so edits show on reload.

Usage:  python tools/serve.py [port]      (default 8765, serves the project root)
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
                      '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


print(f'BOXFLOW dev server: http://localhost:{PORT}')
http.server.ThreadingHTTPServer(('', PORT), NoCache).serve_forever()
