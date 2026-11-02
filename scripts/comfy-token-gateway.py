#!/usr/bin/env python3
"""Local authenticated HTTP/WebSocket gateway for a private ComfyUI tunnel."""
import argparse
import asyncio
import hashlib
import hmac
import json
import secrets
import time
from pathlib import Path
from urllib.parse import urlsplit

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web

COOKIE = "__Host-comfy-session"
HOP_HEADERS = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"}


def create_app(secret_file: Path, upstream="http://127.0.0.1:8188"):
    config = json.loads(secret_file.read_text())
    token = config["access_token"]
    signing_key = bytes.fromhex(config["cookie_secret"])
    if len(token) < 40 or len(signing_key) < 32:
        raise ValueError("Use a random access token and a 256-bit cookie key.")
    session_key = web.AppKey("upstream_session", ClientSession)

    def token_matches(candidate):
        return hmac.compare_digest(candidate.encode("utf-8"), token.encode("ascii"))

    def session_valid(value):
        try:
            expires, nonce, signature = value.split(".")
            expected = hmac.new(signing_key, f"{expires}.{nonce}".encode(), hashlib.sha256).hexdigest()
            return int(expires) > time.time() and hmac.compare_digest(expected, signature)
        except (ValueError, TypeError, AttributeError):
            return False

    def authenticated(request):
        bearer = request.headers.get("Authorization", "")
        return (bearer.startswith("Bearer ") and token_matches(bearer[7:])) or session_valid(request.cookies.get(COOKIE, ""))

    def valid_origin(request):
        origin = request.headers.get("Origin")
        return not origin or urlsplit(origin).netloc == request.host

    def login_page(error="", status=200):
        html = """<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Private ComfyUI</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111214;color:#eee;font:16px system-ui;padding:24px}
main{width:100%;max-width:420px}h1{font-size:28px;margin:0 0 12px}p{color:#aaa;line-height:1.5}label{display:block;margin:28px 0 10px}
input,button{font:inherit;width:100%;padding:14px;border-radius:8px}input{background:#1e2024;color:#fff;border:1px solid #555}button{margin-top:16px;background:#e8e8e8;color:#111;border:0;cursor:pointer}.error{color:#ffaaa2}
</style><main><h1>Private ComfyUI</h1><p>Enter your access token to open the Wan-Animate-2 workspace.</p>ERROR
<form action="/auth/login" method="post"><label for="token">Access token</label><input id="token" name="token" type="password" required autocomplete="current-password" autofocus><button>Open ComfyUI</button></form></main></html>""".replace("ERROR", f'<p class="error">{error}</p>' if error else "")
        return web.Response(text=html, content_type="text/html", status=status, headers={
            "Cache-Control": "no-store", "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        })

    async def login(request):
        if request.method == "GET":
            return login_page()
        if not valid_origin(request):
            raise web.HTTPForbidden()
        if request.content_length is None or request.content_length > 4096:
            raise web.HTTPRequestEntityTooLarge(max_size=4096, actual_size=request.content_length or 0)
        form = await request.post()
        if not token_matches(str(form.get("token", ""))):
            return login_page("Invalid access token.", 401)
        value = f"{int(time.time()) + 43200}.{secrets.token_hex(16)}"
        signature = hmac.new(signing_key, value.encode(), hashlib.sha256).hexdigest()
        response = web.HTTPSeeOther("/")
        response.set_cookie(COOKIE, f"{value}.{signature}", secure=True, httponly=True, samesite="Strict", max_age=43200, path="/")
        response.headers["Cache-Control"] = "no-store"
        return response

    async def proxy(request):
        if not authenticated(request):
            if request.path == "/" and request.method == "GET":
                raise web.HTTPSeeOther("/auth/login")
            return web.json_response({"error": "Access token required."}, status=401, headers={"Cache-Control": "no-store"})
        if (request.method not in {"GET", "HEAD", "OPTIONS"} or request.headers.get("Upgrade", "").lower() == "websocket") and not valid_origin(request):
            raise web.HTTPForbidden()
        target = upstream.rstrip("/") + str(request.rel_url)
        headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_HEADERS | {"authorization", "cookie"} and not k.lower().startswith("sec-websocket-")}
        client = request.app[session_key]
        if request.headers.get("Upgrade", "").lower() == "websocket":
            remote = await client.ws_connect(target, headers=headers, heartbeat=20, max_msg_size=0)
            local = web.WebSocketResponse(heartbeat=20, max_msg_size=0)
            await local.prepare(request)

            async def relay(source, destination):
                async for message in source:
                    if message.type == WSMsgType.TEXT:
                        await destination.send_str(message.data)
                    elif message.type == WSMsgType.BINARY:
                        await destination.send_bytes(message.data)
                    elif message.type == WSMsgType.ERROR:
                        break

            tasks = [asyncio.create_task(relay(local, remote)), asyncio.create_task(relay(remote, local))]
            try:
                await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
                await remote.close()
                await local.close()
            return local
        async with client.request(request.method, target, headers=headers, data=request.content if request.can_read_body else None, allow_redirects=False) as remote:
            response = web.StreamResponse(status=remote.status, headers={k: v for k, v in remote.headers.items() if k.lower() not in HOP_HEADERS})
            response.headers["Referrer-Policy"] = "no-referrer"
            response.headers["Cache-Control"] = "private, no-store"
            await response.prepare(request)
            async for chunk in remote.content.iter_chunked(256 * 1024):
                await response.write(chunk)
            await response.write_eof()
            return response

    async def client_context(app):
        async with ClientSession(timeout=ClientTimeout(total=None, sock_connect=15, sock_read=1800), auto_decompress=False) as client:
            app[session_key] = client
            yield

    app = web.Application(client_max_size=250 * 1024 * 1024)
    app.cleanup_ctx.append(client_context)
    app.router.add_route("GET", "/auth/login", login)
    app.router.add_route("POST", "/auth/login", login)
    app.router.add_route("*", "/{path:.*}", proxy)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--secrets", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8190)
    args = parser.parse_args()
    web.run_app(create_app(args.secrets), host="127.0.0.1", port=args.port, access_log=None)
