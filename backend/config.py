import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DEFAULT_DATABASE_URL = "postgresql://eduflow:eduflow_dev_password@localhost:5432/eduflow"
DEFAULT_CORS_ORIGINS = (
  "http://localhost:3000,"
  "http://127.0.0.1:3000,"
  "http://localhost:3001,"
  "http://127.0.0.1:3001"
)
DEFAULT_CORS_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_OPENAI_TRANSCRIBE_MODEL = "whisper-1"
DEFAULT_OPENAI_TIMEOUT_SECONDS = "20"
DEFAULT_OPENAI_TRANSCRIBE_TIMEOUT_SECONDS = "120"
DEFAULT_GMAIL_TIMEOUT_SECONDS = "20"
DEFAULT_UPLOADS_DIR = str((Path(__file__).resolve().parent / "uploads"))
DEFAULT_MAX_IMAGE_UPLOAD_BYTES = str(5 * 1024 * 1024)
DEFAULT_MAX_VIDEO_UPLOAD_BYTES = str(30 * 1024 * 1024)
DEFAULT_MAX_RESOURCE_UPLOAD_BYTES = str(20 * 1024 * 1024)


def parse_cors_origins(raw_origins: str) -> list[str]:
  return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


def parse_positive_int(raw_value: str, fallback: int) -> int:
  try:
    parsed = int(raw_value)
  except (TypeError, ValueError):
    return fallback

  return parsed if parsed > 0 else fallback


DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
CORS_ORIGINS = parse_cors_origins(os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS))
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", DEFAULT_CORS_ORIGIN_REGEX)
APP_URL = os.getenv("APP_URL", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)
OPENAI_TRANSCRIBE_MODEL = os.getenv("OPENAI_TRANSCRIBE_MODEL", DEFAULT_OPENAI_TRANSCRIBE_MODEL)
OPENAI_TIMEOUT_SECONDS = max(5, parse_positive_int(os.getenv("OPENAI_TIMEOUT_SECONDS", DEFAULT_OPENAI_TIMEOUT_SECONDS), 20))
OPENAI_TRANSCRIBE_TIMEOUT_SECONDS = max(
  10,
  parse_positive_int(os.getenv("OPENAI_TRANSCRIBE_TIMEOUT_SECONDS", DEFAULT_OPENAI_TRANSCRIBE_TIMEOUT_SECONDS), 120),
)
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()
GMAIL_CLIENT_ID = os.getenv("GMAIL_CLIENT_ID", "").strip()
GMAIL_CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET", "").strip()
GMAIL_REFRESH_TOKEN = os.getenv("GMAIL_REFRESH_TOKEN", "").strip()
GMAIL_SENDER_EMAIL = os.getenv("GMAIL_SENDER_EMAIL", "").strip()
GMAIL_SENDER_NAME = os.getenv("GMAIL_SENDER_NAME", "EduFlow").strip() or "EduFlow"
GMAIL_TIMEOUT_SECONDS = max(5, parse_positive_int(os.getenv("GMAIL_TIMEOUT_SECONDS", DEFAULT_GMAIL_TIMEOUT_SECONDS), 20))
UPLOADS_DIR = Path(os.getenv("UPLOADS_DIR", DEFAULT_UPLOADS_DIR)).resolve()
MAX_IMAGE_UPLOAD_BYTES = max(
  1,
  parse_positive_int(os.getenv("MAX_IMAGE_UPLOAD_BYTES", DEFAULT_MAX_IMAGE_UPLOAD_BYTES), 5 * 1024 * 1024),
)
MAX_VIDEO_UPLOAD_BYTES = max(
  1,
  parse_positive_int(os.getenv("MAX_VIDEO_UPLOAD_BYTES", DEFAULT_MAX_VIDEO_UPLOAD_BYTES), 30 * 1024 * 1024),
)
MAX_RESOURCE_UPLOAD_BYTES = max(
  1,
  parse_positive_int(os.getenv("MAX_RESOURCE_UPLOAD_BYTES", DEFAULT_MAX_RESOURCE_UPLOAD_BYTES), 20 * 1024 * 1024),
)
