import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage

from ..config import (
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_SENDER_EMAIL,
  GMAIL_SENDER_NAME,
  GMAIL_TIMEOUT_SECONDS,
)


def _missing_gmail_config_fields() -> list[str]:
  missing: list[str] = []
  if not GMAIL_CLIENT_ID:
    missing.append("GMAIL_CLIENT_ID")
  if not GMAIL_CLIENT_SECRET:
    missing.append("GMAIL_CLIENT_SECRET")
  if not GMAIL_REFRESH_TOKEN:
    missing.append("GMAIL_REFRESH_TOKEN")
  return missing


def _extract_http_error_message(error: urllib.error.HTTPError) -> str:
  try:
    raw_body = error.read().decode("utf-8")
    payload = json.loads(raw_body)
  except (UnicodeDecodeError, json.JSONDecodeError):
    payload = None

  if isinstance(payload, dict):
    error_payload = payload.get("error")
    if isinstance(error_payload, str) and error_payload.strip():
      return error_payload.strip()

    if isinstance(error_payload, dict):
      message = error_payload.get("message")
      if isinstance(message, str) and message.strip():
        return message.strip()

      status = error_payload.get("status")
      if isinstance(status, str) and status.strip():
        return status.strip()

  return f"HTTP {error.code}"


def _get_gmail_access_token() -> tuple[str | None, str | None]:
  missing_fields = _missing_gmail_config_fields()
  if missing_fields:
    return None, f"Gmail API is not configured. Missing: {', '.join(missing_fields)}."

  form_body = urllib.parse.urlencode(
    {
      "client_id": GMAIL_CLIENT_ID,
      "client_secret": GMAIL_CLIENT_SECRET,
      "refresh_token": GMAIL_REFRESH_TOKEN,
      "grant_type": "refresh_token",
    },
  ).encode("utf-8")
  request = urllib.request.Request(
    "https://oauth2.googleapis.com/token",
    data=form_body,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    method="POST",
  )

  try:
    with urllib.request.urlopen(request, timeout=GMAIL_TIMEOUT_SECONDS) as response:
      response_text = response.read().decode("utf-8")
  except urllib.error.HTTPError as error:
    return None, f"Unable to get Gmail access token: {_extract_http_error_message(error)}."
  except (urllib.error.URLError, TimeoutError):
    return None, "Unable to reach Google OAuth service."

  try:
    payload = json.loads(response_text)
  except json.JSONDecodeError:
    return None, "Invalid OAuth response while getting Gmail access token."

  access_token = payload.get("access_token")
  if not isinstance(access_token, str) or not access_token.strip():
    return None, "Google OAuth response did not include an access token."

  return access_token.strip(), None


def _build_welcome_email_body(course_title: str, welcome_message: str) -> str:
  custom_message = welcome_message.strip()
  if custom_message:
    # Use the exact automated message configured on the course.
    return custom_message

  normalized_course_title = course_title.strip() or "your course"
  return (
    f"Your enrollment for \"{normalized_course_title}\" has been approved.\n\n"
    "You can now start learning from your dashboard."
  )


def _build_completion_email_body(course_title: str, congratulations_message: str) -> str:
  custom_message = congratulations_message.strip()
  if custom_message:
    # Use the exact automated message configured on the course.
    return custom_message

  normalized_course_title = course_title.strip() or "your course"
  return (
    f"Congratulations on completing \"{normalized_course_title}\".\n\n"
    "Great work finishing all sections."
  )


def _send_course_email(
  *,
  student_email: str,
  subject: str,
  body: str,
) -> tuple[bool, str | None]:
  recipient = student_email.strip()
  if not recipient:
    return False, "Student email is required."

  access_token, token_error = _get_gmail_access_token()
  if not access_token:
    return False, token_error or "Unable to get Gmail access token."

  message = EmailMessage()
  # If sender email is not set, Gmail API will use the authenticated account.
  if GMAIL_SENDER_EMAIL:
    message["From"] = f"{GMAIL_SENDER_NAME} <{GMAIL_SENDER_EMAIL}>"
  message["To"] = recipient
  message["Subject"] = subject
  message.set_content(body)

  encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
  request_body = json.dumps({"raw": encoded_message}).encode("utf-8")
  request = urllib.request.Request(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    data=request_body,
    headers={
      "Authorization": f"Bearer {access_token}",
      "Content-Type": "application/json",
    },
    method="POST",
  )

  try:
    with urllib.request.urlopen(request, timeout=GMAIL_TIMEOUT_SECONDS):
      pass
  except urllib.error.HTTPError as error:
    return False, f"Unable to send email via Gmail API: {_extract_http_error_message(error)}."
  except (urllib.error.URLError, TimeoutError):
    return False, "Unable to reach Gmail API service."

  return True, None


def send_course_welcome_email(
  *,
  student_email: str,
  course_title: str,
  welcome_message: str,
) -> tuple[bool, str | None]:
  return _send_course_email(
    student_email=student_email,
    subject=f"Enrollment Approved: {course_title.strip() or 'Your Course'}",
    body=_build_welcome_email_body(course_title, welcome_message),
  )


def send_course_completion_email(
  *,
  student_email: str,
  course_title: str,
  congratulations_message: str,
) -> tuple[bool, str | None]:
  return _send_course_email(
    student_email=student_email,
    subject=f"Course Completed: {course_title.strip() or 'Your Course'}",
    body=_build_completion_email_body(course_title, congratulations_message),
  )
