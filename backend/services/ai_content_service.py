import json
import random
import re
import urllib.error
import urllib.parse
import urllib.request
from html import unescape

from fastapi import HTTPException, status

from ..config import OPENAI_API_KEY, OPENAI_MODEL, OPENAI_TIMEOUT_SECONDS, YOUTUBE_API_KEY
from ..schemas import (
  GenerateCourseCopyInput,
  GenerateCourseCopyResponse,
  GenerateQuizFromVideoInput,
  GenerateQuizFromVideoResponse,
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
  quiz_payload, ai_error = call_openai_quiz_generator(payload, video_context)
  if not quiz_payload:
    fallback_quiz = build_fallback_quiz(payload)
    return GenerateQuizFromVideoResponse(
      success=True,
      quiz=fallback_quiz,
      message=f"Used fallback quiz generator. Reason: {ai_error}" if ai_error else "Used fallback quiz generator.",
    )

  message = None
  if ai_error:
    message = ai_error
  elif not video_context.get("title"):
    message = "Quiz generated from provided URL and lesson context."

  return GenerateQuizFromVideoResponse(success=True, quiz=quiz_payload, message=message)
