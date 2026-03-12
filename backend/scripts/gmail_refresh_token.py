import argparse
import json
import os
import secrets
import sys
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from dotenv import load_dotenv, set_key


DEFAULT_SCOPE = "https://www.googleapis.com/auth/gmail.send"
DEFAULT_REDIRECT_URI = "http://localhost:8765/oauth2callback"
TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"


class OAuthCallbackHandler(BaseHTTPRequestHandler):
  def log_message(self, format, *args):
    return

  def _write_response(self, status_code: int, body: str) -> None:
    self.send_response(status_code)
    self.send_header("Content-Type", "text/html; charset=utf-8")
    self.end_headers()
    self.wfile.write(body.encode("utf-8"))

  def do_GET(self):
    parsed = urllib.parse.urlparse(self.path)
    params = urllib.parse.parse_qs(parsed.query)
    error = params.get("error", [None])[0]
    if error:
      self.server.oauth_error = error
      self._write_response(
        400,
        "<h1>OAuth Error</h1><p>Authorization failed. You can close this tab.</p>",
      )
      return

    code = params.get("code", [None])[0]
    state = params.get("state", [None])[0]
    if not code:
      self.server.oauth_error = "Missing authorization code."
      self._write_response(
        400,
        "<h1>OAuth Error</h1><p>Missing authorization code. You can close this tab.</p>",
      )
      return
    if state != self.server.expected_state:
      self.server.oauth_error = "State mismatch."
      self._write_response(
        400,
        "<h1>OAuth Error</h1><p>State mismatch. Please retry.</p>",
      )
      return

    self.server.authorization_code = code
    self._write_response(
      200,
      "<h1>All set</h1><p>You can close this tab and return to the terminal.</p>",
    )


def _parse_redirect_uri(redirect_uri: str) -> tuple[str, int]:
  parsed = urllib.parse.urlparse(redirect_uri)
  if parsed.scheme != "http":
    raise ValueError("Redirect URI must use http:// for local callback.")
  if parsed.hostname not in {"localhost", "127.0.0.1"}:
    raise ValueError("Redirect URI host must be localhost or 127.0.0.1.")
  if not parsed.port:
    raise ValueError("Redirect URI must include a port (e.g., http://localhost:8765/oauth2callback).")
  return parsed.hostname, parsed.port


def _build_auth_url(client_id: str, redirect_uri: str, scope: str, state: str) -> str:
  query = urllib.parse.urlencode(
    {
      "client_id": client_id,
      "redirect_uri": redirect_uri,
      "response_type": "code",
      "scope": scope,
      "access_type": "offline",
      "prompt": "consent",
      "include_granted_scopes": "true",
      "state": state,
    },
  )
  return f"{AUTH_URL}?{query}"


def _exchange_code_for_refresh_token(
  *,
  client_id: str,
  client_secret: str,
  code: str,
  redirect_uri: str,
) -> tuple[str | None, str | None]:
  payload = urllib.parse.urlencode(
    {
      "client_id": client_id,
      "client_secret": client_secret,
      "code": code,
      "redirect_uri": redirect_uri,
      "grant_type": "authorization_code",
    },
  ).encode("utf-8")
  request = urllib.request.Request(
    TOKEN_URL,
    data=payload,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    method="POST",
  )
  try:
    with urllib.request.urlopen(request, timeout=30) as response:
      response_body = response.read().decode("utf-8")
  except urllib.error.HTTPError as error:
    error_body = error.read().decode("utf-8")
    try:
      error_payload = json.loads(error_body)
    except json.JSONDecodeError:
      return None, f"Token exchange failed: HTTP {error.code}."
    return None, f"Token exchange failed: {error_payload.get('error_description') or error_payload.get('error') or 'unknown error'}."
  except (urllib.error.URLError, TimeoutError):
    return None, "Unable to reach Google OAuth service."

  try:
    token_payload = json.loads(response_body)
  except json.JSONDecodeError:
    return None, "Token exchange returned invalid JSON."

  refresh_token = token_payload.get("refresh_token")
  if not refresh_token:
    return None, (
      "Google did not return a refresh token. "
      "Ensure access_type=offline and prompt=consent, or revoke the app in your Google Account and retry."
    )
  return refresh_token, None


def main() -> int:
  parser = argparse.ArgumentParser(description="Generate a Gmail OAuth refresh token.")
  parser.add_argument(
    "--env",
    default=str((Path(__file__).resolve().parents[2] / ".env")),
    help="Path to the .env file to read and update.",
  )
  parser.add_argument(
    "--redirect-uri",
    default=os.getenv("GMAIL_REDIRECT_URI", DEFAULT_REDIRECT_URI),
    help="OAuth redirect URI (must match Google OAuth client configuration).",
  )
  parser.add_argument(
    "--scope",
    default=os.getenv("GMAIL_OAUTH_SCOPE", DEFAULT_SCOPE),
    help="OAuth scope to request.",
  )
  parser.add_argument(
    "--timeout",
    type=int,
    default=300,
    help="Seconds to wait for the OAuth redirect.",
  )
  parser.add_argument(
    "--print-token",
    action="store_true",
    help="Print the refresh token to stdout after generation.",
  )
  parser.add_argument(
    "--no-update",
    action="store_true",
    help="Do not write the refresh token to the .env file.",
  )
  args = parser.parse_args()

  env_path = Path(args.env).resolve()
  if not env_path.exists():
    print(f"Missing .env file at {env_path}", file=sys.stderr)
    return 1

  load_dotenv(env_path)
  client_id = os.getenv("GMAIL_CLIENT_ID", "").strip()
  client_secret = os.getenv("GMAIL_CLIENT_SECRET", "").strip()
  if not client_id or not client_secret:
    print("Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET in .env.", file=sys.stderr)
    return 1

  try:
    host, port = _parse_redirect_uri(args.redirect_uri)
  except ValueError as exc:
    print(str(exc), file=sys.stderr)
    return 1

  state = secrets.token_urlsafe(16)
  auth_url = _build_auth_url(client_id, args.redirect_uri, args.scope, state)
  print("Open this URL in your browser and grant Gmail access:")
  print(auth_url)

  server = HTTPServer((host, port), OAuthCallbackHandler)
  server.expected_state = state
  server.authorization_code = None
  server.oauth_error = None
  server.timeout = 1

  deadline = time.time() + args.timeout
  print(f"Waiting for OAuth redirect on {args.redirect_uri} (timeout {args.timeout}s)...")
  while time.time() < deadline and not server.authorization_code and not server.oauth_error:
    server.handle_request()

  if server.oauth_error:
    print(f"OAuth failed: {server.oauth_error}", file=sys.stderr)
    return 1
  if not server.authorization_code:
    print("Timed out waiting for OAuth redirect.", file=sys.stderr)
    return 1

  refresh_token, error = _exchange_code_for_refresh_token(
    client_id=client_id,
    client_secret=client_secret,
    code=server.authorization_code,
    redirect_uri=args.redirect_uri,
  )
  if error:
    print(error, file=sys.stderr)
    return 1

  if not args.no_update:
    set_key(str(env_path), "GMAIL_REFRESH_TOKEN", refresh_token)
    print("Saved new GMAIL_REFRESH_TOKEN to .env.")
  else:
    print("Refresh token generated (not saved to .env).")

  if args.print_token:
    print(refresh_token)

  return 0


if __name__ == "__main__":
  raise SystemExit(main())
