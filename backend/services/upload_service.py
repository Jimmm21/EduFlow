import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from ..config import MAX_IMAGE_UPLOAD_BYTES, MAX_RESOURCE_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES, UPLOADS_DIR

IMAGE_UPLOAD_DIR = UPLOADS_DIR / "course-images"
VIDEO_UPLOAD_DIR = UPLOADS_DIR / "promo-videos"
LESSON_VIDEO_UPLOAD_DIR = UPLOADS_DIR / "lesson-videos"
RESOURCE_UPLOAD_DIR = UPLOADS_DIR / "resource-files"
AVATAR_UPLOAD_DIR = UPLOADS_DIR / "avatars"

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".m4v", ".avi"}
FALLBACK_IMAGE_EXTENSION = ".jpg"
FALLBACK_VIDEO_EXTENSION = ".mp4"
FALLBACK_RESOURCE_EXTENSION = ".bin"


def ensure_upload_directories() -> None:
  IMAGE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
  VIDEO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
  LESSON_VIDEO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
  RESOURCE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
  AVATAR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_extension(file_name: str, allowed_extensions: set[str], fallback_extension: str) -> str:
  extension = Path(file_name).suffix.lower().strip()
  if extension in allowed_extensions:
    return extension
  return fallback_extension


def sanitize_any_extension(file_name: str, fallback_extension: str) -> str:
  extension = Path(file_name).suffix.lower().strip()
  if extension and extension != ".":
    return extension
  return fallback_extension


async def save_course_image(file: UploadFile, base_url: str) -> dict[str, str]:
  return await _save_file(
    file=file,
    base_url=base_url,
    upload_directory=IMAGE_UPLOAD_DIR,
    upload_subpath="course-images",
    max_size_bytes=MAX_IMAGE_UPLOAD_BYTES,
    expected_mime_prefix="image/",
    allowed_extensions=ALLOWED_IMAGE_EXTENSIONS,
    fallback_extension=FALLBACK_IMAGE_EXTENSION,
    error_label="Course image",
  )


async def save_promo_video(file: UploadFile, base_url: str) -> dict[str, str]:
  return await _save_file(
    file=file,
    base_url=base_url,
    upload_directory=VIDEO_UPLOAD_DIR,
    upload_subpath="promo-videos",
    max_size_bytes=MAX_VIDEO_UPLOAD_BYTES,
    expected_mime_prefix="video/",
    allowed_extensions=ALLOWED_VIDEO_EXTENSIONS,
    fallback_extension=FALLBACK_VIDEO_EXTENSION,
    error_label="Promotional video",
  )


async def save_lesson_video(file: UploadFile, base_url: str) -> dict[str, str]:
  return await _save_file(
    file=file,
    base_url=base_url,
    upload_directory=LESSON_VIDEO_UPLOAD_DIR,
    upload_subpath="lesson-videos",
    max_size_bytes=MAX_VIDEO_UPLOAD_BYTES,
    expected_mime_prefix="video/",
    allowed_extensions=ALLOWED_VIDEO_EXTENSIONS,
    fallback_extension=FALLBACK_VIDEO_EXTENSION,
    error_label="Lesson video",
  )


async def save_resource_file(file: UploadFile, base_url: str) -> dict[str, str]:
  return await _save_any_file(
    file=file,
    base_url=base_url,
    upload_directory=RESOURCE_UPLOAD_DIR,
    upload_subpath="resource-files",
    max_size_bytes=MAX_RESOURCE_UPLOAD_BYTES,
    fallback_extension=FALLBACK_RESOURCE_EXTENSION,
    error_label="Resource file",
  )


async def save_avatar_image(file: UploadFile, base_url: str) -> dict[str, str]:
  return await _save_file(
    file=file,
    base_url=base_url,
    upload_directory=AVATAR_UPLOAD_DIR,
    upload_subpath="avatars",
    max_size_bytes=MAX_IMAGE_UPLOAD_BYTES,
    expected_mime_prefix="image/",
    allowed_extensions=ALLOWED_IMAGE_EXTENSIONS,
    fallback_extension=FALLBACK_IMAGE_EXTENSION,
    error_label="Avatar image",
  )


async def _save_any_file(
  *,
  file: UploadFile,
  base_url: str,
  upload_directory: Path,
  upload_subpath: str,
  max_size_bytes: int,
  fallback_extension: str,
  error_label: str,
) -> dict[str, str]:
  file_name = (file.filename or "").strip()
  if not file_name:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{error_label} name is required.")

  try:
    binary_data = await file.read(max_size_bytes + 1)
  finally:
    await file.close()

  if len(binary_data) == 0:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{error_label} cannot be empty.")

  if len(binary_data) > max_size_bytes:
    size_mb = max_size_bytes / (1024 * 1024)
    raise HTTPException(
      status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
      detail=f"{error_label} must be {size_mb:.0f} MB or smaller.",
    )

  extension = sanitize_any_extension(file_name, fallback_extension)
  stored_file_name = f"{upload_subpath}-{secrets.token_hex(16)}{extension}"
  stored_file_path = upload_directory / stored_file_name
  upload_directory.mkdir(parents=True, exist_ok=True)

  try:
    stored_file_path.write_bytes(binary_data)
  except OSError as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail=f"Unable to store {error_label.lower()}.",
    ) from error

  normalized_base_url = base_url.rstrip("/")
  public_url = f"{normalized_base_url}/uploads/{upload_subpath}/{stored_file_name}"

  return {
    "url": public_url,
    "fileName": file_name,
  }


async def _save_file(
  *,
  file: UploadFile,
  base_url: str,
  upload_directory: Path,
  upload_subpath: str,
  max_size_bytes: int,
  expected_mime_prefix: str,
  allowed_extensions: set[str],
  fallback_extension: str,
  error_label: str,
) -> dict[str, str]:
  file_name = (file.filename or "").strip()
  if not file_name:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{error_label} file name is required.")

  content_type = (file.content_type or "").strip().lower()
  if not content_type.startswith(expected_mime_prefix):
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail=f"{error_label} must be a valid {expected_mime_prefix.rstrip('/')} file.",
    )

  try:
    binary_data = await file.read(max_size_bytes + 1)
  finally:
    await file.close()

  if len(binary_data) == 0:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{error_label} cannot be empty.")

  if len(binary_data) > max_size_bytes:
    size_mb = max_size_bytes / (1024 * 1024)
    raise HTTPException(
      status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
      detail=f"{error_label} must be {size_mb:.0f} MB or smaller.",
    )

  extension = sanitize_extension(file_name, allowed_extensions, fallback_extension)
  stored_file_name = f"{upload_subpath}-{secrets.token_hex(16)}{extension}"
  stored_file_path = upload_directory / stored_file_name
  upload_directory.mkdir(parents=True, exist_ok=True)

  try:
    stored_file_path.write_bytes(binary_data)
  except OSError as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail=f"Unable to store {error_label.lower()}.",
    ) from error

  normalized_base_url = base_url.rstrip("/")
  public_url = f"{normalized_base_url}/uploads/{upload_subpath}/{stored_file_name}"

  return {
    "url": public_url,
    "fileName": file_name,
  }
