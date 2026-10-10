#!/usr/bin/env python3
"""
Local server for CAMI Captions.

Serves the app's static pages and relays live caption/settings updates
between the Operator Console and any number of Display Screens — including
ones open on a different computer on the same network (e.g. a machine
running vMix, picking up the Display Screen as a Web Browser source).

No external dependencies — just the Python standard library, so it runs
from a double-click with nothing to install.
"""

import http.server
import json
import os
import queue
import socket
import socketserver
import sys
import threading

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Cloud hosts (Render, Railway, Fly.io, ...) assign a port via $PORT and
# expect the app to listen on it; local runs just use 8787 unless told otherwise.
PORT = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 8787))

state_lock = threading.Lock()
state = {"settings": None, "caption": None}  # caption: {"lines": [...], "interim": "..."}

subscribers = []
subscribers_lock = threading.Lock()


def broadcast(message):
    with subscribers_lock:
        targets = list(subscribers)
    for q in targets:
        q.put(message)


def get_lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet during a live service

    def do_GET(self):
        if self.path == "/api/events":
            self.handle_sse()
            return
        if self.path == "/api/info":
            self.send_json({"origin": self.compute_origin()})
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/update":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            try:
                message = json.loads(raw.decode("utf-8"))
            except ValueError:
                self.send_response(400)
                self.end_headers()
                return
            with state_lock:
                if message.get("type") == "settings":
                    base = state["settings"] or {}
                    state["settings"] = {**base, **message.get("settings", {})}
                elif message.get("type") == "caption":
                    state["caption"] = {
                        "lines": message.get("lines", []),
                        "interim": message.get("interim", ""),
                    }
            broadcast(message)
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def compute_origin(self):
        # Reflects back whatever address the browser actually used to reach
        # this server — works unchanged whether that's a LAN IP, a public
        # domain behind HTTPS (cloud hosts set X-Forwarded-Proto), or
        # anything else. The one case that needs help is "localhost": that
        # means something different on every other device, so if someone
        # opened the Operator Console that way, guess a LAN-reachable
        # address instead so it's actually useful to hand to another machine.
        host_header = self.headers.get("Host", "")
        hostname = host_header.split(":")[0] if host_header else ""
        if hostname in ("localhost", "127.0.0.1", ""):
            return f"http://{get_lan_ip()}:{PORT}"
        proto = self.headers.get("X-Forwarded-Proto", "http")
        return f"{proto}://{host_header}"

    def send_json(self, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        q = queue.Queue()
        with subscribers_lock:
            subscribers.append(q)

        try:
            # Bring a newly-connected page (e.g. a Display Screen opened
            # mid-service) up to date immediately, not just on the next change.
            with state_lock:
                if state["settings"] is not None:
                    self._write_event({"type": "settings", "settings": state["settings"]})
                if state["caption"] is not None:
                    self._write_event({"type": "caption", **state["caption"]})

            while True:
                try:
                    message = q.get(timeout=15)
                    self._write_event(message)
                except queue.Empty:
                    self.wfile.write(b": keep-alive\n\n")
                    self.wfile.flush()
        except OSError:
            pass  # client disconnected
        finally:
            with subscribers_lock:
                if q in subscribers:
                    subscribers.remove(q)

    def _write_event(self, message):
        data = json.dumps(message)
        self.wfile.write(f"data: {data}\n\n".encode("utf-8"))
        self.wfile.flush()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    server = Server(("0.0.0.0", PORT), Handler)
    ip = get_lan_ip()
    print("CAMI Captions server running.")
    print(f"  On this computer:  http://localhost:{PORT}/")
    print(f"  On your network:   http://{ip}:{PORT}/")
    print("Give the network address to vMix, or open it from another computer on the same Wi-Fi/network.")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
