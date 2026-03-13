import base64
import html
import json
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage
from pathlib import Path

from ..config import (
  APP_URL,
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_SENDER_EMAIL,
  GMAIL_SENDER_NAME,
  GMAIL_TIMEOUT_SECONDS,
)


EMAIL_HEADER_CID = "eduflow_email_header"
EMAIL_HEADER_ASSET_PATH = Path(__file__).resolve().parent.parent / "assets" / "eduflow-email-header.svg"


def _missing_gmail_config_fields() -> list[str]:
  missing: list[str] = []
  if not GMAIL_CLIENT_ID:
    missing.append("GMAIL_CLIENT_ID")
  if not GMAIL_CLIENT_SECRET:
    missing.append("GMAIL_CLIENT_SECRET")
  if not GMAIL_REFRESH_TOKEN:
    missing.append("GMAIL_REFRESH_TOKEN")
  if not GMAIL_SENDER_EMAIL:
    missing.append("GMAIL_SENDER_EMAIL")
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


def _build_reminder_email_body(course_title: str, reminder_message: str) -> str:
  custom_message = reminder_message.strip()
  if custom_message:
    # Use the exact automated message configured on the course.
    return custom_message

  normalized_course_title = course_title.strip() or "your course"
  return (
    f"Quick reminder for \"{normalized_course_title}\": steady progress beats long gaps.\n\n"
    "Complete your next lesson, then write one short takeaway so it sticks."
  )


def _load_email_header_asset() -> tuple[bytes, str] | None:
  try:
    return EMAIL_HEADER_ASSET_PATH.read_bytes(), "image/svg+xml"
  except FileNotFoundError:
    return None


def _format_plain_text_body(body: str, cta_url: str | None, cta_label: str | None) -> str:
  normalized_body = body.strip()
  if not cta_url:
    return normalized_body

  if cta_url in normalized_body:
    return normalized_body

  label = (cta_label or "Open EduFlow").strip() or "Open EduFlow"
  return f"{normalized_body}\n\n{label}: {cta_url}"


def _format_body_html(body: str) -> str:
  paragraphs = [segment.strip() for segment in body.split("\n\n") if segment.strip()]
  if not paragraphs:
    return ""

  formatted = []
  for paragraph in paragraphs:
    escaped = html.escape(paragraph).replace("\n", "<br />")
    formatted.append(
      (
        "<p style=\"margin:0 0 16px; font-size:15px; line-height:1.6; color:#334155;\">"
        f"{escaped}</p>"
      ),
    )
  return "".join(formatted)


def _build_email_html(
  *,
  headline: str,
  body: str,
  cta_url: str | None,
  cta_label: str | None,
  header_cid: str | None,
) -> str:
  escaped_headline = html.escape(headline.strip() or "EduFlow Update")
  body_html = _format_body_html(body)
  preheader_text = html.escape((body.strip().splitlines() or ["EduFlow update"])[0])
  cta_block = ""
  if cta_url:
    cta_text = html.escape((cta_label or "Open EduFlow").strip() or "Open EduFlow")
    escaped_url = html.escape(cta_url, quote=True)
    cta_block = f"""
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
        <tr>
          <td align="center" bgcolor="#2563eb" style="border-radius:999px;">
            <a href="{escaped_url}" style="display:inline-block; padding:12px 26px; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none;">
              {cta_text}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:14px 0 0; font-size:12px; color:#64748b;">
        Or copy this link: <a href="{escaped_url}" style="color:#2563eb; text-decoration:none;">{escaped_url}</a>
      </p>
    """

  header_block = (
    f"<img src=\"cid:{header_cid}\" alt=\"EduFlow\" width=\"600\" "
    "style=\"display:block; width:100%; height:auto; border:0;\" />"
  ) if header_cid else (
    "<div style=\"padding:28px 32px; background:#eff6ff; text-align:center;\">"
    "<span style=\"font-size:20px; font-weight:700; letter-spacing:2px; color:#1d4ed8;\">"
    "EDUFLOW"
    "</span>"
    "</div>"
  )

  return f"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{escaped_headline}</title>
  </head>
  <body style="margin:0; padding:0; background:#f8fafc; font-family:Arial, sans-serif;">
    <span style="display:none; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      {preheader_text}
    </span>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc; padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px; max-width:600px; background:#ffffff; border-radius:24px; overflow:hidden; border:1px solid #e2e8f0;">
            <tr>
              <td>
                {header_block}
              </td>
            </tr>
            <tr>
              <td style="padding:26px 32px 6px;">
                <h1 style="margin:0; font-size:22px; color:#0f172a;">{escaped_headline}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 26px;">
                {body_html}
                {cta_block}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 28px; border-top:1px solid #e2e8f0;">
                <p style="margin:0; font-size:12px; color:#94a3b8;">
                  Sent by {html.escape(GMAIL_SENDER_NAME)} - Reply to this email if you need help.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()


def _send_course_email(
  *,
  student_email: str,
  subject: str,
  body: str,
  headline: str,
  cta_url: str | None = None,
  cta_label: str | None = None,
) -> tuple[bool, str | None]:
  recipient = student_email.strip()
  if not recipient:
    return False, "Student email is required."

  access_token, token_error = _get_gmail_access_token()
  if not access_token:
    return False, token_error or "Unable to get Gmail access token."

  message = EmailMessage()
  message["From"] = f"{GMAIL_SENDER_NAME} <{GMAIL_SENDER_EMAIL}>"
  message["To"] = recipient
  message["Subject"] = subject
  message.set_content(_format_plain_text_body(body, cta_url, cta_label))

  header_asset = _load_email_header_asset()
  header_cid = EMAIL_HEADER_CID if header_asset else None
  html_body = _build_email_html(
    headline=headline,
    body=body,
    cta_url=cta_url,
    cta_label=cta_label,
    header_cid=header_cid,
  )
  message.add_alternative(html_body, subtype="html")
  html_part = message.get_payload()[-1] if message.is_multipart() else None

  if header_asset and isinstance(html_part, EmailMessage):
    header_bytes, header_mime = header_asset
    maintype, subtype = header_mime.split("/", 1)
    html_part.add_related(header_bytes, maintype=maintype, subtype=subtype, cid=EMAIL_HEADER_CID)

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
  normalized_course_title = course_title.strip() or "Your Course"
  cta_url = APP_URL.strip() or None
  return _send_course_email(
    student_email=student_email,
    subject=f"Enrollment Approved: {normalized_course_title}",
    body=_build_welcome_email_body(course_title, welcome_message),
    headline=f"You're in for {normalized_course_title}",
    cta_url=cta_url,
    cta_label="Open your dashboard",
  )


def send_course_completion_email(
  *,
  student_email: str,
  course_title: str,
  congratulations_message: str,
) -> tuple[bool, str | None]:
  normalized_course_title = course_title.strip() or "Your Course"
  cta_url = APP_URL.strip() or None
  return _send_course_email(
    student_email=student_email,
    subject=f"Course Completed: {normalized_course_title}",
    body=_build_completion_email_body(course_title, congratulations_message),
    headline=f"Congrats on finishing {normalized_course_title}",
    cta_url=cta_url,
    cta_label="View your progress",
  )


def send_course_reminder_email(
  *,
  student_email: str,
  course_title: str,
  reminder_message: str,
) -> tuple[bool, str | None]:
  normalized_course_title = course_title.strip() or "Your Course"
  cta_url = APP_URL.strip() or None
  return _send_course_email(
    student_email=student_email,
    subject=f"Course Reminder: {normalized_course_title}",
    body=_build_reminder_email_body(course_title, reminder_message),
    headline=f"Keep going in {normalized_course_title}",
    cta_url=cta_url,
    cta_label="Continue learning",
  )
