"""Servidor local da SF Engine (igual ao do SG Engine): serve a pasta da engine sem cache (a versao nova aparece depois do
Fetch/Pull) e deixa o editor SALVAR arquivos direto na pasta project/ (game.json, arte do SF Pixel, estagios).
uso: python tools/serve.py [porta]    (o "Abrir SF Engine.bat" faz isso)"""
import http.server
import json
import os
import socketserver
import sys
import urllib.parse
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PROJ = os.path.join(ROOT, "project")
os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm", ".js": "application/javascript",
                      ".json": "application/json", ".data": "application/octet-stream", ".sfc": "application/octet-stream"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/api/ping"):
            return self._json(200, {"ok": True, "app": "sf-engine"})
        if self.path.startswith("/api/arquivos"):   # arquivos .json da pasta project/ (arte do SF Pixel, estagios)
            return self._json(200, sorted(f for f in os.listdir(PROJ) if f.endswith(".json")))
        return super().do_GET()

    def do_POST(self):
        # /api/salvar?f=nome.json : grava o corpo em project/nome.json (so dentro de project/, so .json)
        u = urllib.parse.urlparse(self.path)
        if u.path != "/api/salvar":
            return self._json(404, {"erro": "nao existe"})
        name = urllib.parse.parse_qs(u.query).get("f", [""])[0]
        dest = os.path.abspath(os.path.join(PROJ, name))
        if not name or not dest.startswith(PROJ + os.sep) or not dest.endswith(".json"):
            return self._json(400, {"erro": "so arquivos .json dentro de project/"})
        n = int(self.headers.get("Content-Length", 0))
        if n > 64 * 1024 * 1024:
            return self._json(400, {"erro": "arquivo grande demais"})
        data = self.rfile.read(n)
        try:
            json.loads(data)
        except ValueError:
            return self._json(400, {"erro": "nao e JSON"})
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        tmp = dest + ".tmp"
        open(tmp, "wb").write(data)
        os.replace(tmp, dest)
        return self._json(200, {"ok": True, "arquivo": os.path.relpath(dest, ROOT)})


socketserver.TCPServer.allow_reuse_address = True
try:
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler)
except OSError:
    print("A porta %d ja esta em uso: feche a outra janela preta da SF Engine e abra de novo." % PORT)
    input("Enter para sair...")
    sys.exit(1)
print("SF Engine rodando em http://localhost:%d  (feche esta janela para encerrar)" % PORT)
if os.environ.get("SF_SEM_NAVEGADOR") != "1":
    webbrowser.open("http://localhost:%d/editor/lutadores.html" % PORT)
srv.serve_forever()
