from __future__ import annotations

from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from ..config import (
  R2_ACCESS_KEY_ID,
  R2_BUCKET_NAME,
  R2_ENDPOINT,
  R2_PUBLIC_BASE_URL,
  R2_REGION,
  R2_SECRET_ACCESS_KEY,
)

_R2_CLIENT = None


def r2_is_configured() -> bool:
  return all(
    [
      R2_ENDPOINT,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME,
      R2_PUBLIC_BASE_URL,
    ],
  )


def build_public_url(object_key: str) -> str:
  normalized_base = R2_PUBLIC_BASE_URL.rstrip("/")
  normalized_key = object_key.lstrip("/")
  return f"{normalized_base}/{normalized_key}"


def parse_r2_object_key(url: str) -> str | None:
  normalized_base = R2_PUBLIC_BASE_URL.rstrip("/")
  if not normalized_base:
    return None
  prefix = f"{normalized_base}/"
  if not url.startswith(prefix):
    return None
  object_key = url[len(prefix) :].lstrip("/")
  return object_key or None


def upload_bytes(
  *,
  object_key: str,
  data: bytes,
  content_type: str | None,
) -> str | None:
  if not r2_is_configured():
    return "Cloudflare R2 is not configured."

  client = _get_r2_client()
  extra_args = {"ContentType": content_type} if content_type else None
  try:
    if extra_args:
      client.put_object(Bucket=R2_BUCKET_NAME, Key=object_key, Body=data, **extra_args)
    else:
      client.put_object(Bucket=R2_BUCKET_NAME, Key=object_key, Body=data)
  except (ClientError, BotoCoreError):
    return "Unable to upload to Cloudflare R2."

  return None


def download_to_path(*, object_key: str, destination: Path) -> str | None:
  if not r2_is_configured():
    return "Cloudflare R2 is not configured."

  destination.parent.mkdir(parents=True, exist_ok=True)
  client = _get_r2_client()
  try:
    client.download_file(R2_BUCKET_NAME, object_key, str(destination))
  except (ClientError, BotoCoreError):
    return "Unable to download from Cloudflare R2."

  return None


def _get_r2_client():
  global _R2_CLIENT
  if _R2_CLIENT is None:
    _R2_CLIENT = boto3.client(
      "s3",
      endpoint_url=R2_ENDPOINT,
      aws_access_key_id=R2_ACCESS_KEY_ID,
      aws_secret_access_key=R2_SECRET_ACCESS_KEY,
      region_name=R2_REGION,
      config=Config(signature_version="s3v4"),
    )
  return _R2_CLIENT
