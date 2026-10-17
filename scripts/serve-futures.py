"""Serve this checkout's Futures Scanner without browser caching."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class ScannerHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description='Futures Scanner geliştirme sunucusu')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    print(f'Sunulan depo: {ROOT}', flush=True)
    print(f'Sayfa: http://127.0.0.1:{args.port}/futures-opportunity.html', flush=True)
    print('Kapatmak için Ctrl+C. Tarayıcı önbelleği kullanılmaz.', flush=True)
    try:
        with ThreadingHTTPServer(('127.0.0.1', args.port), partial(ScannerHandler, directory=str(ROOT))) as server:
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
    except OSError as error:
        parser.exit(1, f'Sunucu başlatılamadı: {error}. Eski sunucuyu Ctrl+C ile kapatın veya --port 8001 kullanın.\n')


if __name__ == '__main__':
    main()
