import hashlib
import secrets


def hash_password(password: str) -> str:
  iterations = 390000
  salt = secrets.token_hex(16)
  hash_bytes = hashlib.pbkdf2_hmac(
    "sha256",
    password.encode("utf-8"),
    bytes.fromhex(salt),
    iterations,
  )
  return f"pbkdf2_sha256${iterations}${salt}${hash_bytes.hex()}"


def verify_password(password: str, stored_hash: str | None) -> bool:
  if not stored_hash:
    return False

  try:
    algorithm, raw_iterations, salt, expected_hash = stored_hash.split("$", 3)
  except ValueError:
    return False

  if algorithm != "pbkdf2_sha256":
    return False

  try:
    iterations = int(raw_iterations)
  except ValueError:
    return False

  hash_bytes = hashlib.pbkdf2_hmac(
    "sha256",
    password.encode("utf-8"),
    bytes.fromhex(salt),
    iterations,
  )
  return secrets.compare_digest(hash_bytes.hex(), expected_hash)
