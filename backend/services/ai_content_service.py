import json
import mimetypes
import random
import re
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from html import unescape
from pathlib import Path
from xml.etree import ElementTree

from fastapi import HTTPException, status

from ..config import (
  MAX_VIDEO_UPLOAD_BYTES,
  OPENAI_API_KEY,
  OPENAI_MODEL,
  OPENAI_TIMEOUT_SECONDS,
  OPENAI_TRANSCRIBE_MODEL,
  OPENAI_TRANSCRIBE_TIMEOUT_SECONDS,
  UPLOADS_DIR,
  YOUTUBE_API_KEY,
)
from . import storage_service
from ..schemas import (
  GenerateAutomatedMessagesInput,
  GenerateAutomatedMessagesResponse,
  GenerateCourseCopyInput,
  GenerateCourseCopyResponse,
  GenerateQuizFromVideoInput,
  GenerateQuizFromVideoResponse,
  GeneratedAutomatedMessages,
  GeneratedCourseCopy,
  GeneratedQuizAnswer,
  GeneratedQuizPayload,
  GeneratedQuizQuestion,
)

STOP_WORDS = {
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
  "your",
}

YOUTUBE_ID_REGEX = re.compile(r"^[a-zA-Z0-9_-]{11}$")
TRANSCRIPT_MAX_CHARS = 12000
TRANSCRIPT_SNIPPET_MAX_CHARS = 6000
SUMMARY_MAX_CHARS = 300
KEY_POINTS_MAX = 10
AUDIO_DIR_NAME = "audio"
TRANSCRIPT_DIR_NAME = "transcripts"


def truncate_text(value: str, max_chars: int) -> tuple[str, bool]:
  cleaned = value.strip()
  if len(cleaned) <= max_chars:
    return cleaned, False
  return cleaned[: max_chars - 3].rstrip() + "...", True


def normalize_transcript_text(value: str) -> str:
  return re.sub(r"\s+", " ", unescape(value)).strip()


def pick_preferred_track(tracks: list[ElementTree.Element]) -> ElementTree.Element | None:
  if not tracks:
    return None

  for track in tracks:
    lang = (track.attrib.get("lang_code") or "").lower()
    if lang.startswith("en"):
      return track

  return tracks[0]


def fetch_youtube_transcript(video_id: str) -> str | None:
  list_url = f"https://www.youtube.com/api/timedtext?type=list&v={video_id}"
  request = urllib.request.Request(list_url, headers={"User-Agent": "Mozilla/5.0"})
  try:
    with urllib.request.urlopen(request, timeout=OPENAI_TIMEOUT_SECONDS) as response:
      list_payload = response.read().decode("utf-8", errors="ignore")
  except (urllib.error.URLError, TimeoutError):
    return None

  try:
    list_root = ElementTree.fromstring(list_payload)
  except ElementTree.ParseError:
    return None

  tracks = list(list_root.findall("track"))
  preferred = pick_preferred_track(tracks)
  if not preferred:
    return None

  lang_code = preferred.attrib.get("lang_code", "").strip()
  if not lang_code:
    return None

  kind = preferred.attrib.get("kind", "").strip()
  params = {"v": video_id, "lang": lang_code, "fmt": "json3"}
  if kind:
    params["kind"] = kind

  transcript_url = f"https://www.youtube.com/api/timedtext?{urllib.parse.urlencode(params)}"
  transcript_request = urllib.request.Request(transcript_url, headers={"User-Agent": "Mozilla/5.0"})
  try:
    with urllib.request.urlopen(transcript_request, timeout=OPENAI_TIMEOUT_SECONDS) as response:
      transcript_payload = response.read().decode("utf-8", errors="ignore")
  except (urllib.error.URLError, TimeoutError):
    transcript_payload = ""

  transcript_text = ""
  if transcript_payload:
    try:
      parsed = json.loads(transcript_payload)
      events = parsed.get("events")
      if isinstance(events, list):
        segments: list[str] = []
        for event in events:
          segs = event.get("segs") if isinstance(event, dict) else None
          if not isinstance(segs, list):
            continue
          for seg in segs:
            if isinstance(seg, dict) and isinstance(seg.get("utf8"), str):
              segments.append(seg["utf8"])
        transcript_text = "".join(segments)
    except (TypeError, json.JSONDecodeError):
      transcript_text = ""

  if transcript_text:
    cleaned = normalize_transcript_text(transcript_text)
    return cleaned or None

  params.pop("fmt", None)
  transcript_url = f"https://www.youtube.com/api/timedtext?{urllib.parse.urlencode(params)}"
  transcript_request = urllib.request.Request(transcript_url, headers={"User-Agent": "Mozilla/5.0"})
  try:
    with urllib.request.urlopen(transcript_request, timeout=OPENAI_TIMEOUT_SECONDS) as response:
      xml_payload = response.read().decode("utf-8", errors="ignore")
  except (urllib.error.URLError, TimeoutError):
    return None

  try:
    xml_root = ElementTree.fromstring(xml_payload)
  except ElementTree.ParseError:
    return None

  text_nodes = [node.text or "" for node in xml_root.findall("text")]
  if not text_nodes:
    return None
  cleaned = normalize_transcript_text(" ".join(text_nodes))
  return cleaned or None


def resolve_local_upload_path(video_url: str) -> Path | None:
  parsed = urllib.parse.urlparse(video_url)
  path = parsed.path or ""
  marker = "/uploads/lesson-videos/"
  if marker not in path:
    return None

  file_name = path.split(marker, 1)[1].split("/", 1)[0]
  if not file_name:
    return None

  candidate = (UPLOADS_DIR / "lesson-videos" / file_name).resolve()
  uploads_root = UPLOADS_DIR.resolve()
  if not str(candidate).startswith(str(uploads_root)):
    return None
  if not candidate.exists():
    return None
  return candidate


def resolve_r2_lesson_video_key(video_url: str) -> str | None:
  object_key = storage_service.parse_r2_object_key(video_url)
  if not object_key:
    return None
  if not object_key.startswith("lesson-videos/"):
    return None
  return object_key


def ensure_transcript_directories() -> tuple[Path, Path]:
  audio_dir = (UPLOADS_DIR / AUDIO_DIR_NAME).resolve()
  transcript_dir = (UPLOADS_DIR / TRANSCRIPT_DIR_NAME).resolve()
  audio_dir.mkdir(parents=True, exist_ok=True)
  transcript_dir.mkdir(parents=True, exist_ok=True)
  return audio_dir, transcript_dir


def convert_video_to_mp3(file_path: Path) -> tuple[Path | None, str | None]:
  audio_dir, _ = ensure_transcript_directories()
  output_path = (audio_dir / f"{file_path.stem}.mp3").resolve()
  command = [
    "ffmpeg",
    "-y",
    "-i",
    str(file_path),
    "-vn",
    "-acodec",
    "libmp3lame",
    "-ab",
    "128k",
    str(output_path),
  ]

  try:
    subprocess.run(command, check=True, capture_output=True, text=True)
  except FileNotFoundError:
    return None, "ffmpeg is not installed."
  except subprocess.CalledProcessError as error:
    error_output = (error.stderr or error.stdout or "").strip()
    message = error_output.splitlines()[-1] if error_output else "ffmpeg failed to convert the video."
    return None, f"ffmpeg failed to convert the video. {message}"

  if not output_path.exists():
    return None, "Converted mp3 file could not be created."

  return output_path, None


def save_transcript_pdf(transcript: str, source_name: str) -> str | None:
  _, transcript_dir = ensure_transcript_directories()
  sanitized = re.sub(r"[^a-zA-Z0-9_-]+", "_", source_name.strip().lower()) or "transcript"
  output_path = (transcript_dir / f"{sanitized}.pdf").resolve()

  try:
    from fpdf import FPDF
  except ImportError:
    return None

  try:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    for line in transcript.splitlines():
      pdf.multi_cell(0, 6, line)
    pdf.output(str(output_path))
  except Exception:
    return None

  return str(output_path)


def get_video_transcript(
  video_url: str,
  video_context: dict[str, str],
) -> tuple[str | None, str | None, str | None]:
  video_id = video_context.get("videoId") or extract_youtube_video_id(video_url)
  if video_id:
    transcript, error = transcribe_youtube_video(video_url)
    if transcript:
      return transcript, "YouTube video (Whisper)", None
    return None, None, error or "Unable to extract audio from the YouTube link."

  local_path = resolve_local_upload_path(video_url)
  if local_path:
    transcript, transcript_error = transcribe_local_video(local_path)
    if transcript:
      return transcript, "uploaded video file", None
    return None, None, transcript_error or "Unable to transcribe the uploaded video."

  r2_object_key = resolve_r2_lesson_video_key(video_url)
  if not r2_object_key:
    return None, None, "Video URL must be a YouTube link or an uploaded lesson video file."

  transcript, transcript_error = transcribe_r2_video(r2_object_key)
  if transcript:
    return transcript, "uploaded video file (cloud storage)", None

  return None, None, transcript_error or "Unable to transcribe the uploaded video."


def build_multipart_form_data(
  fields: dict[str, str],
  file_field: str,
  file_name: str,
  file_bytes: bytes,
  file_content_type: str,
) -> tuple[bytes, str]:
  boundary = f"----EduFlowBoundary{random.randint(0, 1_000_000_000)}"
  lines: list[bytes] = []

  for name, value in fields.items():
    lines.append(f"--{boundary}\r\n".encode("utf-8"))
    lines.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
    lines.append(f"{value}\r\n".encode("utf-8"))

  lines.append(f"--{boundary}\r\n".encode("utf-8"))
  lines.append(
    f'Content-Disposition: form-data; name="{file_field}"; filename="{file_name}"\r\n'.encode("utf-8")
  )
  lines.append(f"Content-Type: {file_content_type}\r\n\r\n".encode("utf-8"))
  lines.append(file_bytes)
  lines.append(b"\r\n")
  lines.append(f"--{boundary}--\r\n".encode("utf-8"))

  return b"".join(lines), boundary


def build_ytdlp_base_opts(output_template: str | None) -> dict[str, object]:
  opts: dict[str, object] = {
    "quiet": True,
    "no_warnings": True,
    "noplaylist": True,
    "cachedir": False,
    "retries": 2,
    "socket_timeout": max(10, int(OPENAI_TRANSCRIBE_TIMEOUT_SECONDS / 2)),
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "geo_bypass": True,
    "force_ipv4": True,
    "format": "bv*+ba/best",
    "extractor_args": {
      "youtube": {
        "player_client": ["android", "web"],
      }
    },
    "allow_unplayable_formats": True,
    "ignore_no_formats_error": True,
    "merge_output_format": "mp4",
  }
  if output_template:
    opts["outtmpl"] = output_template
  return opts


def can_download_youtube_video(video_url: str) -> tuple[bool, str | None]:
  try:
    import yt_dlp
  except ImportError:
    return False, "yt-dlp is not installed. Install it to enable YouTube downloads."

  opts = {**build_ytdlp_base_opts(None), "skip_download": True}
  try:
    with yt_dlp.YoutubeDL(opts) as ydl:
      info = ydl.extract_info(video_url, download=False)
  except Exception as error:
    return False, f"Unable to access YouTube video formats. {error}"

  if not info or not isinstance(info, dict):
    return False, "Unable to access YouTube video formats."

  formats = info.get("formats")
  if isinstance(formats, list) and not formats:
    return False, "No downloadable YouTube formats were found."

  return True, None


def transcribe_local_video(
  file_path: Path,
  source_name: str | None = None,
) -> tuple[str | None, str | None]:
  if not OPENAI_API_KEY:
    return None, "OPENAI_API_KEY is not configured."

  if not file_path.exists():
    return None, "Uploaded video file could not be found."

  file_size = file_path.stat().st_size
  if file_size == 0:
    return None, "Uploaded video file is empty."

  source_path = file_path
  mp3_path, mp3_error = convert_video_to_mp3(file_path)
  if mp3_path:
    source_path = mp3_path
  elif mp3_error:
    # Continue with original file when conversion fails.
    pass

  source_size = source_path.stat().st_size
  if source_size > MAX_VIDEO_UPLOAD_BYTES:
    if mp3_error and source_path == file_path:
      return None, f"Uploaded video file is too large to transcribe. {mp3_error}"
    return None, "Uploaded video file is too large to transcribe."

  mime_type = mimetypes.guess_type(source_path.name)[0] or "application/octet-stream"
  file_bytes = source_path.read_bytes()
  fields = {"model": OPENAI_TRANSCRIBE_MODEL, "response_format": "json"}
  body, boundary = build_multipart_form_data(fields, "file", source_path.name, file_bytes, mime_type)

  request = urllib.request.Request(
    "https://api.openai.com/v1/audio/transcriptions",
    data=body,
    headers={
      "Authorization": f"Bearer {OPENAI_API_KEY}",
      "Content-Type": f"multipart/form-data; boundary={boundary}",
    },
    method="POST",
  )

  try:
    with urllib.request.urlopen(request, timeout=OPENAI_TRANSCRIBE_TIMEOUT_SECONDS) as response:
      response_text = response.read().decode("utf-8")
  except urllib.error.HTTPError as error:
    return None, extract_openai_error_message(error)
  except TimeoutError:
    return (
      None,
      f"OpenAI transcription timed out after {OPENAI_TRANSCRIBE_TIMEOUT_SECONDS}s. "
      "Try a shorter clip or increase OPENAI_TRANSCRIBE_TIMEOUT_SECONDS.",
    )
  except urllib.error.URLError as error:
    reason = getattr(error, "reason", None)
    detail = f" ({reason})" if reason else ""
    return None, f"OpenAI transcription service is currently unreachable{detail}."

  try:
    payload = json.loads(response_text)
  except json.JSONDecodeError:
    return None, "OpenAI transcription returned an unexpected response format."

  transcript = payload.get("text") if isinstance(payload, dict) else None
  if not isinstance(transcript, str) or not transcript.strip():
    return None, "OpenAI transcription returned empty text."

  normalized = normalize_transcript_text(transcript)
  save_transcript_pdf(normalized, source_name or file_path.stem)
  return normalized, None


def transcribe_r2_video(object_key: str) -> tuple[str | None, str | None]:
  file_name = Path(object_key).name or "uploaded-video"
  with tempfile.TemporaryDirectory(prefix="eduflow_r2_") as temp_dir:
    temp_path = Path(temp_dir) / file_name
    download_error = storage_service.download_to_path(object_key=object_key, destination=temp_path)
    if download_error:
      return None, download_error
    return transcribe_local_video(temp_path, source_name=temp_path.stem)


def transcribe_youtube_video(video_url: str) -> tuple[str | None, str | None]:
  try:
    import yt_dlp
  except ImportError:
    return None, "yt-dlp is not installed. Install it to enable YouTube video downloads."

  video_id = extract_youtube_video_id(video_url) or "video"
  with tempfile.TemporaryDirectory(prefix="eduflow_yt_") as temp_dir:
    output_template = str(Path(temp_dir) / f"{video_id}.%(ext)s")
    base_opts = build_ytdlp_base_opts(output_template)
    try:
      with yt_dlp.YoutubeDL(base_opts) as ydl:
        info = ydl.extract_info(video_url, download=True)
        file_path = Path(ydl.prepare_filename(info))
    except Exception as error:
      return None, f"Unable to download YouTube video. {error}"

    if not file_path.exists():
      mp4_candidate = file_path.with_suffix(".mp4")
      if mp4_candidate.exists():
        file_path = mp4_candidate
      else:
        return None, "YouTube video download failed."

    return transcribe_local_video(file_path, source_name=video_id)

def normalize_key_points(raw_points: object) -> list[str]:
  if not isinstance(raw_points, list):
    return []

  normalized: list[str] = []
  for item in raw_points:
    if not isinstance(item, str):
      continue
    cleaned = item.strip().lstrip("-").strip()
    if cleaned and cleaned not in normalized:
      normalized.append(cleaned)
    if len(normalized) >= KEY_POINTS_MAX:
      break

  return normalized


def check_transcription_options(video_url: str) -> dict[str, object]:
  cleaned_url = video_url.strip()
  if not cleaned_url:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Video URL is required.")

  video_context = fetch_youtube_video_context(cleaned_url)
  video_id = video_context.get("videoId") or extract_youtube_video_id(cleaned_url)

  details: dict[str, object] = {
    "videoUrl": cleaned_url,
    "videoId": video_id,
    "hasYoutubeCaptions": False,
    "canDownloadYoutubeAudio": None,
    "uploadFileResolved": False,
    "uploadFilePath": None,
    "message": None,
  }

  if video_id:
    can_download, error = can_download_youtube_video(cleaned_url)
    details["canDownloadYoutubeAudio"] = can_download
    if can_download:
      details["message"] = "YouTube video download is available; it will be converted to MP3 and transcribed."
    else:
      details["message"] = (
        error
        or "Unable to access YouTube video formats. Upload the video file if the link is restricted."
      )
    return details

  local_path = resolve_local_upload_path(cleaned_url)
  if local_path:
    details["uploadFileResolved"] = True
    details["uploadFilePath"] = str(local_path)
    details["message"] = "Uploaded lesson video file resolved."
    return details

  r2_object_key = resolve_r2_lesson_video_key(cleaned_url)
  if r2_object_key:
    details["uploadFileResolved"] = True
    details["uploadFilePath"] = r2_object_key
    details["message"] = "Uploaded lesson video file resolved from cloud storage."
    return details

  details["message"] = "Video URL is not a YouTube link and no uploaded lesson video file was found."
  return details


def call_openai_video_summarizer(
  transcript: str,
  video_context: dict[str, str],
  lesson_title: str,
) -> tuple[str | None, list[str], str | None]:
  if not OPENAI_API_KEY:
    return None, [], "OPENAI_API_KEY is not configured."

  trimmed_transcript, was_trimmed = truncate_text(transcript, TRANSCRIPT_MAX_CHARS)
  lesson_label = lesson_title.strip() or "Untitled lesson"

  system_prompt = "You summarize instructional videos for quiz generation. Return valid JSON only."
  user_lines = [
    f"Lesson title: {lesson_label}",
  ]
  if video_context.get("title"):
    user_lines.append(f"Video title: {video_context['title']}")
  if video_context.get("channelTitle"):
    user_lines.append(f"Channel: {video_context['channelTitle']}")
  if video_context.get("duration"):
    user_lines.append(f"Duration: {video_context['duration']}")

  user_prompt = (
    "Summarize the following transcript for quiz generation.\n"
    f"{chr(10).join(user_lines)}\n"
    "Transcript:\n"
    f"{trimmed_transcript}\n"
    "Requirements:\n"
    f"- Summary must be at most {SUMMARY_MAX_CHARS} characters.\n"
    "- Provide 6 to 10 key points (short phrases).\n"
    "Output JSON schema:\n"
    '{ "summary": "string", "keyPoints": ["string"] }\n'
  )
  if was_trimmed:
    user_prompt += "Note: Transcript was truncated to fit size limits.\n"

  request_body = {
    "model": OPENAI_MODEL,
    "response_format": {"type": "json_object"},
    "messages": [
      {"role": "system", "content": system_prompt},
      {"role": "user", "content": user_prompt},
    ],
    "temperature": 0.2,
  }

  request = urllib.request.Request(
    "https://api.openai.com/v1/chat/completions",
    data=json.dumps(request_body).encode("utf-8"),
    headers={
      "Authorization": f"Bearer {OPENAI_API_KEY}",
      "Content-Type": "application/json",
    },
    method="POST",
  )

  try:
    with urllib.request.urlopen(request, timeout=OPENAI_TIMEOUT_SECONDS) as response:
      response_text = response.read().decode("utf-8")
  except urllib.error.HTTPError as error:
    return None, [], extract_openai_error_message(error)
  except (urllib.error.URLError, TimeoutError):
    return None, [], "OpenAI summarization service is currently unreachable."

  try:
    parsed_response = json.loads(response_text)
    content = parsed_response["choices"][0]["message"]["content"]
  except (KeyError, IndexError, TypeError, json.JSONDecodeError):
    return None, [], "OpenAI summarization returned an unexpected response format."

  if not isinstance(content, str):
    return None, [], "OpenAI summarization returned an empty response."

  parsed_content = parse_json_payload(content)
  if not parsed_content:
    return None, [], "OpenAI summarization response could not be parsed."

  summary_raw = parsed_content.get("summary")
  summary = summary_raw.strip() if isinstance(summary_raw, str) else ""
  summary, _ = truncate_text(summary, SUMMARY_MAX_CHARS)
  key_points = normalize_key_points(parsed_content.get("keyPoints"))

  if not summary:
    return None, key_points, "OpenAI summarization did not include a summary."

  return summary, key_points, None


def build_analysis_context(
  summary: str | None,
  key_points: list[str],
  transcript: str | None,
) -> str | None:
  if not summary and not key_points and not transcript:
    return None

  lines: list[str] = []
  if summary:
    lines.append(f"Video summary: {summary}")
  if key_points:
    lines.append("Key points:")
    lines.extend([f"- {point}" for point in key_points])
  if transcript:
    snippet, _ = truncate_text(transcript, TRANSCRIPT_SNIPPET_MAX_CHARS)
    lines.append("Transcript excerpt:")
    lines.append(snippet)

  return "\n".join(lines)


def tokenize_title(title: str) -> list[str]:
  words = re.split(r"[^a-zA-Z0-9]+", title.lower())
  cleaned = [word for word in words if word and word not in STOP_WORDS]
  return cleaned[:6]


def normalize_learning_outcomes(items: list[str]) -> list[str]:
  normalized: list[str] = []
  for item in items:
    cleaned = item.strip().lstrip("-").strip()
    if not cleaned:
      continue
    if cleaned not in normalized:
      normalized.append(cleaned)
  return normalized[:6]


def count_bullet_lines(description: str) -> int:
  return len([line for line in description.splitlines() if line.strip().startswith("- ")])


def shuffle_answers_with_correct_index(
  answers: list[GeneratedQuizAnswer],
  correct_index: int,
) -> tuple[list[GeneratedQuizAnswer], int]:
  indexed_answers = list(enumerate(answers))
  random.shuffle(indexed_answers)
  shuffled_answers = [answer for _, answer in indexed_answers]
  remapped_correct_index = 0

  for shuffled_index, (original_index, _) in enumerate(indexed_answers):
    if original_index == correct_index:
      remapped_correct_index = shuffled_index
      break

  return shuffled_answers, remapped_correct_index


def build_fallback_content(payload: GenerateCourseCopyInput) -> GeneratedCourseCopy:
  topic_words = tokenize_title(payload.title)
  topic_phrase = ", ".join(topic_words[:3]) if topic_words else payload.title.lower()
  title = payload.title.strip()
  level = payload.level.lower()
  category = payload.category.lower()
  language = payload.language

  description = (
    f"Welcome to {title}, a {level} {category} course taught in {language} with a practical, project-first approach. "
    "This course is designed to help you build real confidence by combining core concepts with hands-on implementation from day one.\n\n"
    f"Even if you are starting with limited experience in {topic_phrase}, this course will guide you from fundamentals to real-world execution. Here's why:\n"
    "- The lessons are structured step by step so each topic builds naturally on the previous one.\n"
    "- You will complete guided practical exercises and projects that simulate real professional work.\n"
    "- You will learn debugging, optimization, and delivery practices to ship cleaner and more reliable outcomes."
  )

  base_outcomes = [
    f"Build practical projects around {title} that strengthen your portfolio and job-ready skills",
    "Apply modern tools and workflows to plan, implement, test, and improve complete solutions",
    "Master core concepts and confidently translate theory into real implementation decisions",
    "Debug common issues faster and improve reliability, performance, and maintainability in your work",
    "Use professional development practices such as version control, clean structure, and deployment readiness",
    "Deliver polished outputs you can confidently present in interviews, freelance work, or team projects",
  ]
  return GeneratedCourseCopy(description=description, learningOutcomes=base_outcomes)


def parse_json_payload(content: str) -> dict[str, object] | None:
  raw = content.strip()
  if raw.startswith("```"):
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

  try:
    parsed = json.loads(raw)
  except json.JSONDecodeError:
    return None

  return parsed if isinstance(parsed, dict) else None


def extract_openai_error_message(error: urllib.error.HTTPError) -> str:
  try:
    raw_body = error.read().decode("utf-8")
    payload = json.loads(raw_body)
  except (UnicodeDecodeError, json.JSONDecodeError):
    payload = None

  if isinstance(payload, dict):
    error_obj = payload.get("error")
    if isinstance(error_obj, dict):
      message = error_obj.get("message")
      code = error_obj.get("code")
      if isinstance(message, str) and message.strip():
        return message.strip()
      if isinstance(code, str) and code.strip():
        return f"OpenAI error: {code.strip()}"

  return f"OpenAI request failed with status {error.code}."


def call_openai(payload: GenerateCourseCopyInput) -> tuple[GeneratedCourseCopy | None, str | None]:
  if not OPENAI_API_KEY:
    return None, "OPENAI_API_KEY is not configured."

  system_prompt = (
    "You are an expert course copywriter. Return valid JSON only with keys "
    '"description" (string) and "learningOutcomes" (array of exactly 6 concise strings).'
  )
  user_prompt = (
    "Generate course copy from this input.\n"
    f"Title: {payload.title.strip()}\n"
    f"Category: {payload.category}\n"
    f"Level: {payload.level}\n"
    f"Language: {payload.language}\n"
    "Constraints:\n"
    "- Description must follow this exact structure:\n"
    "  1) Intro paragraph with 2 sentences.\n"
    "  2) Blank line.\n"
    "  3) One sentence ending with \"Here's why:\".\n"
    "  4) Exactly 3 bullet lines, each starting with \"- \".\n"
    "- Keep wording practical and specific, not generic marketing text.\n"
    "- Mention progression from fundamentals to practical implementation.\n"
    "- Mention real-world application and learner confidence by the end.\n"
    "- learningOutcomes must contain exactly 6 items.\n"
    "- Each learning outcome must start with a strong action verb.\n"
    "- Each learning outcome should be 10-18 words.\n"
  )

  request_body = {
    "model": OPENAI_MODEL,
    "response_format": {"type": "json_object"},
    "messages": [
      {"role": "system", "content": system_prompt},
      {"role": "user", "content": user_prompt},
    ],
    "temperature": 0.7,
  }

  request = urllib.request.Request(
    "https://api.openai.com/v1/chat/completions",
    data=json.dumps(request_body).encode("utf-8"),
    headers={
      "Authorization": f"Bearer {OPENAI_API_KEY}",
      "Content-Type": "application/json",
    },
    method="POST",
  )

  try:
    with urllib.request.urlopen(request, timeout=OPENAI_TIMEOUT_SECONDS) as response:
      response_text = response.read().decode("utf-8")
  except urllib.error.HTTPError as error:
    return None, extract_openai_error_message(error)
  except (urllib.error.URLError, TimeoutError):
    return None, "OpenAI service is currently unreachable."

  try:
    parsed_response = json.loads(response_text)
    content = parsed_response["choices"][0]["message"]["content"]
  except (KeyError, IndexError, TypeError, json.JSONDecodeError):
    return None, "OpenAI returned an unexpected response format."

  if not isinstance(content, str):
    return None, "OpenAI returned an empty response."

  parsed_content = parse_json_payload(content)
  if not parsed_content:
    return None, "OpenAI response could not be parsed."

  description = parsed_content.get("description")
  learning_outcomes = parsed_content.get("learningOutcomes")

  if not isinstance(description, str):
    return None, "OpenAI response did not include a description."

  outcomes_list = learning_outcomes if isinstance(learning_outcomes, list) else []
  outcomes = normalize_learning_outcomes([item for item in outcomes_list if isinstance(item, str)])
  if len(outcomes) < 6:
    return None, "OpenAI response did not include six learning outcomes."

  cleaned_description = description.strip()
  if not cleaned_description:
    return None, "OpenAI response included an empty description."
  if count_bullet_lines(cleaned_description) < 3:
    return None, "OpenAI response did not match the required description format."

  return GeneratedCourseCopy(description=cleaned_description, learningOutcomes=outcomes), None


def generate_course_copy(payload: GenerateCourseCopyInput) -> GenerateCourseCopyResponse:
  title = payload.title.strip()
  if not title:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Course title is required.")

  ai_content, ai_error = call_openai(payload)
  if not ai_content:
    ai_content = build_fallback_content(payload)
    return GenerateCourseCopyResponse(
      success=True,
      content=ai_content,
      message=f"Used fallback content generator. Reason: {ai_error}" if ai_error else "Used fallback content generator.",
    )

  return GenerateCourseCopyResponse(success=True, content=ai_content)


def build_fallback_automated_messages(payload: GenerateAutomatedMessagesInput) -> GeneratedAutomatedMessages:
  title = payload.title.strip()
  level = payload.level.lower()
  category = payload.category.lower()
  language = payload.language.strip() or "English"
  topic_words = tokenize_title(payload.description) or tokenize_title(title)
  topic_phrase = ", ".join(topic_words[:3]) if topic_words else title.lower()

  welcome_message = (
    f"Welcome to {title}. You are about to build practical {category} skills at a {level} level in {language}. "
    f"Start with your first lesson now, and focus on one concrete outcome around {topic_phrase} today."
  )
  reminder_message = (
    f"Quick reminder for {title}: steady progress beats long gaps. Complete your next lesson, then write one short "
    "note about what you learned so your momentum stays strong."
  )
  congratulations_message = (
    f"Congratulations on completing {title}! You finished the full learning path and turned concepts into practical "
    f"results. Keep growing by applying your {category} skills in a new mini-project this week."
  )

  return GeneratedAutomatedMessages(
    welcomeMessage=welcome_message,
    reminderMessage=reminder_message,
    congratulationsMessage=congratulations_message,
  )


def call_openai_automated_messages(
  payload: GenerateAutomatedMessagesInput,
) -> tuple[GeneratedAutomatedMessages | None, str | None]:
  if not OPENAI_API_KEY:
    return None, "OPENAI_API_KEY is not configured."

  description = re.sub(r"\s+", " ", payload.description.strip())
  if len(description) > 1200:
    description = description[:1200]

  system_prompt = (
    "You are an instructional copywriter for online courses. Return valid JSON only with keys "
    '"welcomeMessage", "reminderMessage", and "congratulationsMessage".'
  )
  user_prompt = (
    "Generate automated student messages for a course.\n"
    f"Title: {payload.title.strip()}\n"
    f"Category: {payload.category}\n"
    f"Level: {payload.level}\n"
    f"Language: {payload.language}\n"
    f"Course description context: {description or 'Not provided.'}\n"
    "Constraints:\n"
    "- Output strict JSON only.\n"
    "- Each message must be 2-4 sentences and practical, warm, and direct.\n"
    "- Use a formal, professional tone.\n"
    "- welcomeMessage: sent when a student starts the course.\n"
    "- reminderMessage: sent while a student is in progress to encourage continuation.\n"
    "- congratulationsMessage: sent once the student completes the course.\n"
    "- Avoid placeholders like [Name] or <student>.\n"
    "- Keep wording concrete and action-oriented.\n"
  )

  request_body = {
    "model": OPENAI_MODEL,
    "response_format": {"type": "json_object"},
    "messages": [
      {"role": "system", "content": system_prompt},
      {"role": "user", "content": user_prompt},
    ],
    "temperature": 0.6,
  }

  request = urllib.request.Request(
    "https://api.openai.com/v1/chat/completions",
    data=json.dumps(request_body).encode("utf-8"),
    headers={
      "Authorization": f"Bearer {OPENAI_API_KEY}",
      "Content-Type": "application/json",
    },
    method="POST",
  )

  try:
    with urllib.request.urlopen(request, timeout=OPENAI_TIMEOUT_SECONDS) as response:
      response_text = response.read().decode("utf-8")
  except urllib.error.HTTPError as error:
    return None, extract_openai_error_message(error)
  except (urllib.error.URLError, TimeoutError):
    return None, "OpenAI service is currently unreachable."

  try:
    parsed_response = json.loads(response_text)
    content = parsed_response["choices"][0]["message"]["content"]
  except (KeyError, IndexError, TypeError, json.JSONDecodeError):
    return None, "OpenAI returned an unexpected response format."

  if not isinstance(content, str):
    return None, "OpenAI returned an empty response."

  parsed_content = parse_json_payload(content)
  if not parsed_content:
    return None, "OpenAI response could not be parsed."

  welcome_message = parsed_content.get("welcomeMessage")
  reminder_message = parsed_content.get("reminderMessage")
  congratulations_message = parsed_content.get("congratulationsMessage")

  if not isinstance(welcome_message, str) or not welcome_message.strip():
    return None, "OpenAI response did not include a valid welcome message."
  if not isinstance(reminder_message, str) or not reminder_message.strip():
    return None, "OpenAI response did not include a valid reminder message."
  if not isinstance(congratulations_message, str) or not congratulations_message.strip():
    return None, "OpenAI response did not include a valid congratulations message."

  return (
    GeneratedAutomatedMessages(
      welcomeMessage=welcome_message.strip(),
      reminderMessage=reminder_message.strip(),
      congratulationsMessage=congratulations_message.strip(),
    ),
    None,
  )


def generate_automated_messages(
  payload: GenerateAutomatedMessagesInput,
) -> GenerateAutomatedMessagesResponse:
  title = payload.title.strip()
  if not title:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Course title is required.")

  ai_messages, ai_error = call_openai_automated_messages(payload)
  if not ai_messages:
    fallback_messages = build_fallback_automated_messages(payload)
    return GenerateAutomatedMessagesResponse(
      success=True,
      messages=fallback_messages,
      message=f"Used fallback automated messages generator. Reason: {ai_error}"
      if ai_error
      else "Used fallback automated messages generator.",
    )

  return GenerateAutomatedMessagesResponse(success=True, messages=ai_messages)


def extract_youtube_video_id(raw_value: str) -> str | None:
  value = raw_value.strip()
  if not value:
    return None

  if YOUTUBE_ID_REGEX.match(value):
    return value

  try:
    parsed = urllib.parse.urlparse(value)
  except ValueError:
    return None

  hostname = (parsed.hostname or "").lower().replace("www.", "")

  if hostname == "youtu.be":
    candidate = parsed.path.strip("/").split("/")[0]
    return candidate if YOUTUBE_ID_REGEX.match(candidate) else None

  if hostname in {"youtube.com", "m.youtube.com", "youtube-nocookie.com"}:
    query = urllib.parse.parse_qs(parsed.query)
    from_query = query.get("v", [""])[0]
    if YOUTUBE_ID_REGEX.match(from_query):
      return from_query

    segments = [segment for segment in parsed.path.split("/") if segment]
    for index, segment in enumerate(segments):
      if segment in {"embed", "shorts", "live"} and index + 1 < len(segments):
        candidate = segments[index + 1]
        if YOUTUBE_ID_REGEX.match(candidate):
          return candidate

  matched = re.search(r"(?:v=|/embed/|youtu\.be/|/shorts/)([a-zA-Z0-9_-]{11})", value)
  return matched.group(1) if matched else None


def parse_duration_iso8601(duration: str) -> str:
  if not duration:
    return ""

  matched = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
  if not matched:
    return ""

  hours = int(matched.group(1) or 0)
  minutes = int(matched.group(2) or 0)
  seconds = int(matched.group(3) or 0)
  if hours > 0:
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
  return f"{minutes:02d}:{seconds:02d}"


def fetch_youtube_video_context(video_url: str) -> dict[str, str]:
  video_id = extract_youtube_video_id(video_url)
  if not video_id:
    return {"videoUrl": video_url.strip()}

  context: dict[str, str] = {
    "videoUrl": f"https://www.youtube.com/watch?v={video_id}",
    "videoId": video_id,
  }

  if not YOUTUBE_API_KEY:
    return context

  api_url = (
    "https://www.googleapis.com/youtube/v3/videos"
    f"?part=snippet,contentDetails&id={video_id}&key={YOUTUBE_API_KEY}"
  )

  request = urllib.request.Request(api_url, method="GET")
  try:
    with urllib.request.urlopen(request, timeout=OPENAI_TIMEOUT_SECONDS) as response:
      raw = response.read().decode("utf-8")
      payload = json.loads(raw)
  except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError):
    return context

  items = payload.get("items")
  if not isinstance(items, list) or not items:
    return context

  first_item = items[0] if isinstance(items[0], dict) else {}
  snippet = first_item.get("snippet") if isinstance(first_item.get("snippet"), dict) else {}
  content_details = (
    first_item.get("contentDetails") if isinstance(first_item.get("contentDetails"), dict) else {}
  )

  title = snippet.get("title")
  description = snippet.get("description")
  channel_title = snippet.get("channelTitle")
  duration = content_details.get("duration")

  if isinstance(title, str) and title.strip():
    context["title"] = unescape(title.strip())
  if isinstance(description, str) and description.strip():
    # Keep prompt size reasonable while preserving context.
    context["description"] = unescape(description.strip())[:1500]
  if isinstance(channel_title, str) and channel_title.strip():
    context["channelTitle"] = channel_title.strip()
  if isinstance(duration, str):
    parsed_duration = parse_duration_iso8601(duration)
    if parsed_duration:
      context["duration"] = parsed_duration

  return context


def build_metadata_summary(video_context: dict[str, str], lesson_title: str) -> str:
  parts: list[str] = []
  title = video_context.get("title", "").strip()
  description = video_context.get("description", "").strip()
  if title:
    parts.append(title)
  if description:
    parts.append(description)
  if not parts and lesson_title.strip():
    parts.append(lesson_title.strip())

  summary = " - ".join(parts)
  summary, _ = truncate_text(summary, SUMMARY_MAX_CHARS)
  return summary


def build_video_analysis(
  payload: GenerateQuizFromVideoInput,
  video_context: dict[str, str],
) -> tuple[str | None, str | None, str | None]:
  video_url = payload.videoUrl.strip()
  transcript, transcript_source, transcript_error = get_video_transcript(video_url, video_context)
  if not transcript:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail=transcript_error or "Unable to extract audio from the YouTube link.",
    )

  summary: str | None = None
  key_points: list[str] = []
  summary_error: str | None = None
  summary, key_points, summary_error = call_openai_video_summarizer(
    transcript,
    video_context,
    payload.lessonTitle,
  )

  analysis_context = build_analysis_context(summary, key_points, transcript)
  message = None
  if transcript_source and summary_error:
    message = f"Quiz generated from {transcript_source}. Summary unavailable."
  elif transcript_source:
    message = f"Quiz generated from {transcript_source}."

  return summary or None, analysis_context, message


def normalize_quiz_questions(
  questions: list[object],
  expected_count: int,
  requested_type: str,
) -> list[GeneratedQuizQuestion]:
  normalized: list[GeneratedQuizQuestion] = []

  for raw_question in questions:
    if not isinstance(raw_question, dict):
      continue

    text = raw_question.get("text")
    if not isinstance(text, str) or not text.strip():
      continue

    question_type_raw = raw_question.get("type")
    model_type = "True / False" if question_type_raw == "True / False" else "Multiple Choice"
    if requested_type == "Multiple Choice":
      question_type = "Multiple Choice"
    elif requested_type == "True / False":
      question_type = "True / False"
    else:
      question_type = model_type

    raw_answers = raw_question.get("answers")
    if not isinstance(raw_answers, list):
      continue

    answers: list[GeneratedQuizAnswer] = []
    for raw_answer in raw_answers:
      if not isinstance(raw_answer, dict):
        continue

      answer_text = raw_answer.get("text")
      explanation = raw_answer.get("explanation")
      if not isinstance(answer_text, str) or not answer_text.strip():
        continue

      answers.append(
        GeneratedQuizAnswer(
          text=answer_text.strip(),
          explanation=explanation.strip() if isinstance(explanation, str) else "",
        ),
      )

    if question_type == "True / False":
      true_explanation = ""
      false_explanation = ""
      for answer in answers:
        answer_key = answer.text.strip().lower()
        if answer_key == "true" and not true_explanation:
          true_explanation = answer.explanation
        if answer_key == "false" and not false_explanation:
          false_explanation = answer.explanation
      answers = [
        GeneratedQuizAnswer(text="True", explanation=true_explanation),
        GeneratedQuizAnswer(text="False", explanation=false_explanation),
      ]
    else:
      if len(answers) < 4:
        continue
      answers = answers[:4]

    raw_correct_index = raw_question.get("correctAnswerIndex")
    correct_index = raw_correct_index if isinstance(raw_correct_index, int) else 0
    if correct_index < 0 or correct_index >= len(answers):
      correct_index = 0

    if question_type == "Multiple Choice":
      answers, correct_index = shuffle_answers_with_correct_index(answers, correct_index)

    normalized.append(
      GeneratedQuizQuestion(
        text=text.strip(),
        type=question_type,
        answers=answers,
        correctAnswerIndex=correct_index,
      ),
    )

    if len(normalized) >= expected_count:
      break

  return normalized


def build_fallback_quiz(payload: GenerateQuizFromVideoInput) -> GeneratedQuizPayload:
  lesson_title = payload.lessonTitle.strip() or "this lesson"
  base_topic = lesson_title.lower()
  questions: list[GeneratedQuizQuestion] = []

  def build_multiple_choice_question() -> GeneratedQuizQuestion:
    answers = [
      GeneratedQuizAnswer(
        text="A practical workflow that can be applied step by step in real projects.",
        explanation="Correct, this reflects practical implementation focus.",
      ),
      GeneratedQuizAnswer(
        text="A purely theoretical concept with no implementation considerations.",
        explanation="The lesson focuses on implementation, not theory alone.",
      ),
      GeneratedQuizAnswer(
        text="A one-time trick that only works in a single tool or platform.",
        explanation="Core principles should transfer across contexts.",
      ),
      GeneratedQuizAnswer(
        text="An optional detail unrelated to outcomes or decision making.",
        explanation="Key lesson ideas should connect to outcomes.",
      ),
    ]
    shuffled_answers, remapped_correct_index = shuffle_answers_with_correct_index(answers, 0)
    return GeneratedQuizQuestion(
      text=f"Which statement best describes a key idea explained in {base_topic}?",
      type="Multiple Choice",
      answers=shuffled_answers,
      correctAnswerIndex=remapped_correct_index,
    )

  def build_true_false_question(index: int) -> GeneratedQuizQuestion:
    statement = (
      f"{lesson_title} emphasizes applying concepts in practical scenarios, not just memorizing terms."
      if index % 2 == 0
      else f"{lesson_title} suggests that implementation details are unnecessary for real outcomes."
    )
    return GeneratedQuizQuestion(
      text=statement,
      type="True / False",
      answers=[
        GeneratedQuizAnswer(
          text="True",
          explanation="Correct when the statement aligns with practical, applied learning.",
        ),
        GeneratedQuizAnswer(
          text="False",
          explanation="Correct when the statement conflicts with practical implementation focus.",
        ),
      ],
      correctAnswerIndex=0 if index % 2 == 0 else 1,
    )

  for index in range(payload.questionCount):
    if payload.questionType == "True / False":
      questions.append(build_true_false_question(index))
      continue
    if payload.questionType == "Mixed":
      questions.append(build_multiple_choice_question() if index % 2 == 0 else build_true_false_question(index))
      continue

    questions.append(build_multiple_choice_question())

  return GeneratedQuizPayload(
    sourceSummary="Fallback quiz generated from lesson title because video analysis was unavailable.",
    questions=questions,
  )


def call_openai_quiz_generator(
  payload: GenerateQuizFromVideoInput,
  video_context: dict[str, str],
  analysis_context: str | None,
) -> tuple[GeneratedQuizPayload | None, str | None]:
  if not OPENAI_API_KEY:
    return None, "OPENAI_API_KEY is not configured."

  lesson_title = payload.lessonTitle.strip() or "Untitled lesson"
  question_count = payload.questionCount
  question_type_mode = payload.questionType
  source_lines = [
    f"Lesson title: {lesson_title}",
    f"Video URL: {video_context.get('videoUrl', payload.videoUrl.strip())}",
  ]
  if video_context.get("title"):
    source_lines.append(f"YouTube title: {video_context['title']}")
  if video_context.get("channelTitle"):
    source_lines.append(f"Channel: {video_context['channelTitle']}")
  if video_context.get("duration"):
    source_lines.append(f"Duration: {video_context['duration']}")
  if video_context.get("description"):
    source_lines.append(f"Video description snippet: {video_context['description']}")
  if analysis_context:
    source_lines.append("Video analysis summary:")
    source_lines.append(analysis_context)

  system_prompt = (
    "You are an instructional designer. Generate assessment-quality quiz content from lesson/video context. "
    "Return valid JSON only."
  )
  if question_type_mode == "True / False":
    type_requirements = (
      "- Use only 'True / False' type.\n"
      "- Each question must have exactly 2 answers in this exact order: True, False.\n"
      "- Exactly one correct answer index per question (0 for True, 1 for False).\n"
    )
  elif question_type_mode == "Mixed":
    type_requirements = (
      "- Use a mix of 'Multiple Choice' and 'True / False' questions.\n"
      "- Include at least one 'Multiple Choice' and one 'True / False' question.\n"
      "- Multiple Choice questions must have exactly 4 answers.\n"
      "- True / False questions must have exactly 2 answers in this order: True, False.\n"
      "- Exactly one correct answer index per question.\n"
    )
  else:
    type_requirements = (
      "- Use only 'Multiple Choice' type.\n"
      "- Each question must have exactly 4 answers.\n"
      "- Exactly one correct answer index per question.\n"
    )

  user_prompt = (
    "Generate a quiz from the following lesson video context.\n"
    f"{chr(10).join(source_lines)}\n"
    "Requirements:\n"
    f"- Return exactly {question_count} questions.\n"
    "- Each question must test understanding, not trivial recall.\n"
    "- Prefer scenario-based wording when possible.\n"
    f"{type_requirements}"
    "- Include clear explanation text for each answer.\n"
    "Output JSON schema:\n"
    "{\n"
    '  "sourceSummary": "string",\n'
    '  "questions": [\n'
    "    {\n"
    '      "text": "string",\n'
    '      "type": "Multiple Choice | True / False",\n'
    '      "answers": [{"text":"string","explanation":"string"}],\n'
    '      "correctAnswerIndex": 0\n'
    "    }\n"
    "  ]\n"
    "}\n"
  )

  request_body = {
    "model": OPENAI_MODEL,
    "response_format": {"type": "json_object"},
    "messages": [
      {"role": "system", "content": system_prompt},
      {"role": "user", "content": user_prompt},
    ],
    "temperature": 0.4,
  }

  request = urllib.request.Request(
    "https://api.openai.com/v1/chat/completions",
    data=json.dumps(request_body).encode("utf-8"),
    headers={
      "Authorization": f"Bearer {OPENAI_API_KEY}",
      "Content-Type": "application/json",
    },
    method="POST",
  )

  try:
    with urllib.request.urlopen(request, timeout=OPENAI_TIMEOUT_SECONDS) as response:
      response_text = response.read().decode("utf-8")
  except urllib.error.HTTPError as error:
    return None, extract_openai_error_message(error)
  except (urllib.error.URLError, TimeoutError):
    return None, "OpenAI service is currently unreachable."

  try:
    parsed_response = json.loads(response_text)
    content = parsed_response["choices"][0]["message"]["content"]
  except (KeyError, IndexError, TypeError, json.JSONDecodeError):
    return None, "OpenAI returned an unexpected response format."

  if not isinstance(content, str):
    return None, "OpenAI returned an empty response."

  parsed_content = parse_json_payload(content)
  if not parsed_content:
    return None, "OpenAI response could not be parsed."

  raw_questions = parsed_content.get("questions")
  if not isinstance(raw_questions, list):
    return None, "OpenAI response did not include a valid questions array."

  questions = normalize_quiz_questions(raw_questions, payload.questionCount, payload.questionType)
  if len(questions) < payload.questionCount:
    return None, "OpenAI response did not include enough valid questions."
  if payload.questionType == "Mixed":
    has_multiple_choice = any(question.type == "Multiple Choice" for question in questions)
    has_true_false = any(question.type == "True / False" for question in questions)
    if not (has_multiple_choice and has_true_false):
      return None, "OpenAI response did not include both question types for mixed mode."

  source_summary = parsed_content.get("sourceSummary")
  safe_summary = source_summary.strip() if isinstance(source_summary, str) else ""
  return GeneratedQuizPayload(sourceSummary=safe_summary, questions=questions), None


def generate_quiz_from_video(payload: GenerateQuizFromVideoInput) -> GenerateQuizFromVideoResponse:
  video_url = payload.videoUrl.strip()
  if not video_url:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Video URL is required.")

  video_context = fetch_youtube_video_context(video_url)
  analysis_summary, analysis_context, analysis_message = build_video_analysis(payload, video_context)
  quiz_payload, ai_error = call_openai_quiz_generator(payload, video_context, analysis_context)
  if not quiz_payload:
    raise HTTPException(
      status_code=status.HTTP_502_BAD_GATEWAY,
      detail=ai_error or "Unable to generate quiz from the video transcript.",
    )

  if analysis_summary:
    quiz_payload.sourceSummary = analysis_summary

  message = None
  if analysis_message:
    message = analysis_message
  elif not video_context.get("title"):
    message = "Quiz generated from provided URL and lesson context."

  return GenerateQuizFromVideoResponse(success=True, quiz=quiz_payload, message=message)

