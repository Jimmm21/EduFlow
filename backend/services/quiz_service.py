import json
import logging
from datetime import datetime
from typing import Any

import psycopg
from fastapi import HTTPException, status
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from ..database import get_connection
from . import email_service

QUIZ_CONTENT_PREFIX = "__QUIZ_JSON__"
logger = logging.getLogger(__name__)


def normalize_quiz_question_type(value: Any) -> str:
  if isinstance(value, str) and value.strip() == "True / False":
    return "True / False"
  return "Multiple Choice"


def parse_legacy_quiz_content(raw_content: str) -> list[dict[str, Any]]:
  text = raw_content.strip()
  if not text:
    return []

  question_text = text
  explanation_text = ""
  question_marker = "## Question"
  explanation_marker = "## Explanation"
  question_start = text.find(question_marker)
  explanation_start = text.find(explanation_marker)
  if question_start != -1:
    question_text = text[
      question_start + len(question_marker): explanation_start if explanation_start != -1 else len(text)
    ].strip()
  if explanation_start != -1:
    explanation_text = text[explanation_start + len(explanation_marker):].strip()

  if not question_text:
    return []

  question_id = "q1"
  answers = [
    {"id": f"{question_id}-a1", "text": "True", "explanation": explanation_text},
    {"id": f"{question_id}-a2", "text": "False", "explanation": ""},
  ]
  return [
    {
      "id": question_id,
      "text": question_text,
      "type": "True / False",
      "answers": answers,
      "correctAnswerId": answers[0]["id"],
    },
  ]


def parse_quiz_content(raw_content: str | None) -> list[dict[str, Any]]:
  trimmed = (raw_content or "").strip()
  if not trimmed:
    return []

  if not trimmed.startswith(QUIZ_CONTENT_PREFIX):
    return parse_legacy_quiz_content(trimmed)

  raw_json = trimmed[len(QUIZ_CONTENT_PREFIX):].strip()
  if not raw_json:
    return []

  try:
    parsed = json.loads(raw_json)
  except json.JSONDecodeError:
    return []

  if not isinstance(parsed, dict):
    return []

  raw_questions = parsed.get("questions")
  if not isinstance(raw_questions, list):
    return []

  normalized_questions: list[dict[str, Any]] = []
  for question_index, raw_question in enumerate(raw_questions):
    if not isinstance(raw_question, dict):
      continue

    question_text = str(raw_question.get("text") or "").strip()
    if not question_text:
      continue

    question_id = str(raw_question.get("id") or f"q{question_index + 1}").strip()
    if not question_id:
      question_id = f"q{question_index + 1}"

    question_type = normalize_quiz_question_type(raw_question.get("type"))
    raw_answers = raw_question.get("answers")
    if not isinstance(raw_answers, list):
      continue

    normalized_answers: list[dict[str, str]] = []
    for answer_index, raw_answer in enumerate(raw_answers):
      if not isinstance(raw_answer, dict):
        continue

      answer_text = str(raw_answer.get("text") or "").strip()
      if not answer_text:
        continue

      answer_id = str(raw_answer.get("id") or f"{question_id}-a{answer_index + 1}").strip()
      if not answer_id:
        answer_id = f"{question_id}-a{answer_index + 1}"

      normalized_answers.append(
        {
          "id": answer_id,
          "text": answer_text,
          "explanation": str(raw_answer.get("explanation") or "").strip(),
        },
      )

    if question_type == "True / False":
      if len(normalized_answers) >= 2:
        normalized_answers = [
          {
            "id": normalized_answers[0]["id"],
            "text": "True",
            "explanation": normalized_answers[0]["explanation"],
          },
          {
            "id": normalized_answers[1]["id"],
            "text": "False",
            "explanation": normalized_answers[1]["explanation"],
          },
        ]
      else:
        normalized_answers = [
          {"id": f"{question_id}-a1", "text": "True", "explanation": ""},
          {"id": f"{question_id}-a2", "text": "False", "explanation": ""},
        ]

    if len(normalized_answers) < 2:
      continue

    available_answer_ids = {answer["id"] for answer in normalized_answers}
    raw_correct_answer_id = str(raw_question.get("correctAnswerId") or "").strip()
    correct_answer_id = (
      raw_correct_answer_id
      if raw_correct_answer_id in available_answer_ids
      else normalized_answers[0]["id"]
    )

    normalized_questions.append(
      {
        "id": question_id,
        "text": question_text,
        "type": question_type,
        "answers": normalized_answers,
        "correctAnswerId": correct_answer_id,
      },
    )

  return normalized_questions


def ensure_student_exists(cursor: psycopg.Cursor[dict[str, Any]], student_id: str) -> None:
  cursor.execute(
    """
    SELECT id
    FROM app_users
    WHERE id = %s AND role = 'Student';
    """,
    (student_id,),
  )
  if cursor.fetchone() is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student account not found.")


def ensure_student_has_course_access(
  cursor: psycopg.Cursor[dict[str, Any]],
  course_id: str,
  student_id: str,
) -> None:
  cursor.execute(
    """
    SELECT 1
    FROM course_enrollments
    WHERE course_id = %s AND student_id = %s;
    """,
    (course_id, student_id),
  )
  if cursor.fetchone() is None:
    raise HTTPException(
      status_code=status.HTTP_403_FORBIDDEN,
      detail="Student is not approved to access this course.",
    )


def fetch_course_lecture(
  cursor: psycopg.Cursor[dict[str, Any]],
  course_id: str,
  lecture_id: str,
) -> dict[str, Any]:
  cursor.execute(
    """
    SELECT
      c.id AS course_id,
      cs.id AS section_id,
      l.id AS lecture_id,
      l.title AS lecture_title,
      l.content_type,
      l.content
    FROM courses c
    INNER JOIN course_sections cs ON cs.course_id = c.id
    INNER JOIN lectures l ON l.section_id = cs.id
    WHERE
      c.id = %s
      AND l.id = %s
      AND c.status = 'Published'
      AND c.visibility = 'Public';
    """,
    (course_id, lecture_id),
  )
  lecture_row = cursor.fetchone()
  if not lecture_row:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lecture not found.")

  return lecture_row


def fetch_quiz_lecture(
  cursor: psycopg.Cursor[dict[str, Any]],
  course_id: str,
  lecture_id: str,
) -> dict[str, Any]:
  lecture_row = fetch_course_lecture(cursor, course_id, lecture_id)

  if lecture_row["content_type"] != "Quiz":
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected lecture is not a quiz.")

  return lecture_row


def map_latest_attempt_payload(attempt_row: dict[str, Any] | None) -> dict[str, Any] | None:
  if not attempt_row:
    return None

  score = int(attempt_row.get("score") or 0)
  total_questions = int(attempt_row.get("total_questions") or 0)
  submitted_at = attempt_row.get("submitted_at")
  result_json = attempt_row.get("result_json") or {}

  percentage = 0
  results: list[dict[str, Any]] = []
  if isinstance(result_json, dict):
    if isinstance(result_json.get("percentage"), int):
      percentage = max(0, min(100, int(result_json["percentage"])))
    if isinstance(result_json.get("results"), list):
      for raw_result in result_json["results"]:
        if not isinstance(raw_result, dict):
          continue
        question_id = str(raw_result.get("questionId") or "").strip()
        correct_answer_id = str(raw_result.get("correctAnswerId") or "").strip()
        correct_answer_text = str(raw_result.get("correctAnswerText") or "").strip()
        if not question_id or not correct_answer_id or not correct_answer_text:
          continue

        selected_answer_id_raw = raw_result.get("selectedAnswerId")
        selected_answer_text_raw = raw_result.get("selectedAnswerText")
        explanation_raw = raw_result.get("explanation")
        is_correct_raw = raw_result.get("isCorrect")

        results.append(
          {
            "questionId": question_id,
            "selectedAnswerId": str(selected_answer_id_raw).strip() if isinstance(selected_answer_id_raw, str) else None,
            "selectedAnswerText": str(selected_answer_text_raw).strip() if isinstance(selected_answer_text_raw, str) else None,
            "correctAnswerId": correct_answer_id,
            "correctAnswerText": correct_answer_text,
            "isCorrect": bool(is_correct_raw),
            "explanation": str(explanation_raw).strip() if isinstance(explanation_raw, str) else "",
          },
        )

  if percentage == 0 and total_questions > 0:
    percentage = int(round((score / total_questions) * 100))

  submitted_at_iso = (
    submitted_at.isoformat() if isinstance(submitted_at, datetime) else datetime.utcnow().isoformat()
  )

  payload = {
    "attemptId": str(attempt_row["id"]) if attempt_row.get("id") is not None else None,
    "score": score,
    "totalQuestions": total_questions,
    "percentage": max(0, min(100, percentage)),
    "submittedAt": submitted_at_iso,
    "results": results,
  }
  if isinstance(attempt_row.get("course_progress"), int):
    payload["courseProgress"] = max(0, min(100, int(attempt_row["course_progress"])))
  if isinstance(attempt_row.get("completed_lectures"), int):
    payload["completedLectures"] = max(0, int(attempt_row["completed_lectures"]))
  if isinstance(attempt_row.get("total_lectures"), int):
    payload["totalLectures"] = max(0, int(attempt_row["total_lectures"]))
  if isinstance(attempt_row.get("completed_sections"), int):
    payload["completedSections"] = max(0, int(attempt_row["completed_sections"]))
  if isinstance(attempt_row.get("total_sections"), int):
    payload["totalSections"] = max(0, int(attempt_row["total_sections"]))
  learning_status = attempt_row.get("learning_status")
  if isinstance(learning_status, str) and learning_status in {"in-progress", "completed", "wishlist"}:
    payload["courseStatus"] = learning_status

  return payload


def update_student_course_progress_from_completed_lecture(
  cursor: psycopg.Cursor[dict[str, Any]],
  *,
  course_id: str,
  lecture_id: str,
  student_id: str,
) -> dict[str, Any]:
  cursor.execute(
    """
    INSERT INTO student_lecture_progress (user_id, course_id, lecture_id, status, completed_at, updated_at)
    VALUES (%s, %s, %s, 'completed', NOW(), NOW())
    ON CONFLICT (user_id, course_id, lecture_id) DO UPDATE
    SET
      status = 'completed',
      completed_at = COALESCE(student_lecture_progress.completed_at, NOW()),
      updated_at = NOW();
    """,
    (student_id, course_id, lecture_id),
  )

  cursor.execute(
    """
    SELECT COUNT(*) AS total_sections
    FROM course_sections cs
    WHERE cs.course_id = %s;
    """,
    (course_id,),
  )
  total_sections_row = cursor.fetchone() or {}
  total_sections = int(total_sections_row.get("total_sections") or 0)

  cursor.execute(
    """
    SELECT COUNT(*) AS completed_sections
    FROM course_sections cs
    WHERE
      cs.course_id = %s
      AND NOT EXISTS (
        SELECT 1
        FROM lectures l
        WHERE
          l.section_id = cs.id
          AND NOT EXISTS (
            SELECT 1
            FROM student_lecture_progress slp
            WHERE
              slp.user_id = %s
              AND slp.course_id = %s
              AND slp.lecture_id = l.id
              AND slp.status = 'completed'
          )
      );
    """,
    (course_id, student_id, course_id),
  )
  completed_sections_row = cursor.fetchone() or {}
  completed_sections = int(completed_sections_row.get("completed_sections") or 0)

  cursor.execute(
    """
    SELECT COUNT(*) AS total_lectures
    FROM lectures l
    INNER JOIN course_sections cs ON cs.id = l.section_id
    WHERE cs.course_id = %s;
    """,
    (course_id,),
  )
  total_lectures_row = cursor.fetchone() or {}
  total_lectures = int(total_lectures_row.get("total_lectures") or 0)

  cursor.execute(
    """
    SELECT COUNT(*) AS completed_lectures
    FROM student_lecture_progress
    WHERE user_id = %s AND course_id = %s AND status = 'completed';
    """,
    (student_id, course_id),
  )
  completed_lectures_row = cursor.fetchone() or {}
  completed_lectures = int(completed_lectures_row.get("completed_lectures") or 0)

  progress = int(round((completed_sections / total_sections) * 100)) if total_sections > 0 else 0
  progress = max(0, min(100, progress))
  learning_status = "completed" if total_sections > 0 and completed_sections >= total_sections else "in-progress"

  cursor.execute(
    """
    INSERT INTO student_course_progress (user_id, course_id, progress, status, updated_at)
    VALUES (%s, %s, %s, %s, NOW())
    ON CONFLICT (user_id, course_id) DO UPDATE
    SET
      progress = EXCLUDED.progress,
      status = EXCLUDED.status,
      updated_at = NOW();
    """,
    (student_id, course_id, progress, learning_status),
  )
  cursor.execute(
    """
    UPDATE course_enrollments
    SET progress = %s
    WHERE course_id = %s AND student_id = %s;
    """,
    (progress, course_id, student_id),
  )

  return {
    "courseProgress": progress,
    "completedSections": completed_sections,
    "totalSections": total_sections,
    "completedLectures": completed_lectures,
    "totalLectures": total_lectures,
    "courseStatus": learning_status,
  }


def get_student_course_status(
  cursor: psycopg.Cursor[dict[str, Any]],
  *,
  course_id: str,
  student_id: str,
) -> str | None:
  cursor.execute(
    """
    SELECT status
    FROM student_course_progress
    WHERE user_id = %s AND course_id = %s;
    """,
    (student_id, course_id),
  )
  row = cursor.fetchone()
  if not row:
    return None

  status_value = row.get("status")
  if isinstance(status_value, str) and status_value in {"in-progress", "completed", "wishlist"}:
    return status_value
  return None


def fetch_completion_email_payload(
  cursor: psycopg.Cursor[dict[str, Any]],
  *,
  course_id: str,
  student_id: str,
) -> dict[str, str] | None:
  cursor.execute(
    """
    SELECT
      u.email AS student_email,
      c.title AS course_title,
      c.congratulations_message AS course_congratulations_message
    FROM app_users u
    INNER JOIN courses c ON c.id = %s
    WHERE u.id = %s AND u.role = 'Student';
    """,
    (course_id, student_id),
  )
  row = cursor.fetchone()
  if not row:
    return None

  return {
    "student_email": str(row.get("student_email") or "").strip(),
    "course_title": str(row.get("course_title") or "").strip(),
    "congratulations_message": str(row.get("course_congratulations_message") or "").strip(),
  }


def send_completion_email_if_needed(
  *,
  course_id: str,
  student_id: str,
  previous_status: str | None,
  current_status: str,
  completion_email_payload: dict[str, str] | None,
) -> None:
  if current_status != "completed" or previous_status == "completed" or not completion_email_payload:
    return

  try:
    sent, email_error = email_service.send_course_completion_email(
      student_email=completion_email_payload["student_email"],
      course_title=completion_email_payload["course_title"],
      congratulations_message=completion_email_payload["congratulations_message"],
    )
    if not sent:
      logger.warning(
        "Completion email was not sent for student %s in course %s: %s",
        student_id,
        course_id,
        email_error or "Unknown Gmail API error.",
      )
    else:
      logger.info(
        "Completion email sent for student %s in course %s to %s.",
        student_id,
        course_id,
        completion_email_payload["student_email"],
      )
  except Exception:
    logger.exception(
      "Unexpected error while sending completion email for student %s in course %s",
      student_id,
      course_id,
    )


def get_lecture_quiz(course_id: str, lecture_id: str, student_id: str) -> dict[str, Any]:
  normalized_course_id = course_id.strip()
  normalized_lecture_id = lecture_id.strip()
  normalized_student_id = student_id.strip()
  if not normalized_course_id or not normalized_lecture_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Course ID and lecture ID are required.")
  if not normalized_student_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Student ID is required.")

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        ensure_student_exists(cursor, normalized_student_id)
        lecture_row = fetch_quiz_lecture(cursor, normalized_course_id, normalized_lecture_id)
        ensure_student_has_course_access(cursor, normalized_course_id, normalized_student_id)

        questions_with_answers = parse_quiz_content(lecture_row.get("content"))
        if not questions_with_answers:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz content is not configured yet.")

        cursor.execute(
          """
          SELECT
            qa.id,
            qa.score,
            qa.total_questions,
            qa.submitted_at,
            qa.result_json,
            scp.progress AS course_progress,
            scp.status AS learning_status,
            (
              SELECT COUNT(*)
              FROM lectures l
              INNER JOIN course_sections cs ON cs.id = l.section_id
              WHERE cs.course_id = %s
            ) AS total_lectures,
            (
              SELECT COUNT(*)
              FROM student_lecture_progress slp
              WHERE slp.user_id = %s AND slp.course_id = %s AND slp.status = 'completed'
            ) AS completed_lectures,
            (
              SELECT COUNT(*)
              FROM course_sections cs
              WHERE cs.course_id = %s
            ) AS total_sections,
            (
              SELECT COUNT(*)
              FROM course_sections cs
              WHERE
                cs.course_id = %s
                AND NOT EXISTS (
                  SELECT 1
                  FROM lectures l
                  WHERE
                    l.section_id = cs.id
                    AND NOT EXISTS (
                      SELECT 1
                      FROM student_lecture_progress slp2
                      WHERE
                        slp2.user_id = %s
                        AND slp2.course_id = %s
                        AND slp2.lecture_id = l.id
                        AND slp2.status = 'completed'
                    )
                )
            ) AS completed_sections
          FROM quiz_attempts qa
          LEFT JOIN student_course_progress scp
            ON scp.user_id = qa.student_id AND scp.course_id = qa.course_id
          WHERE qa.course_id = %s AND qa.lecture_id = %s AND qa.student_id = %s
          ORDER BY qa.submitted_at DESC;
          """,
          (
            normalized_course_id,
            normalized_student_id,
            normalized_course_id,
            normalized_course_id,
            normalized_course_id,
            normalized_student_id,
            normalized_course_id,
            normalized_course_id,
            normalized_lecture_id,
            normalized_student_id,
          ),
        )
        attempt_rows = cursor.fetchall()
        attempts = [
          mapped_attempt
          for mapped_attempt in (map_latest_attempt_payload(row) for row in attempt_rows)
          if mapped_attempt is not None
        ]
        latest_attempt = attempts[0] if attempts else None
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to fetch quiz.",
    ) from error

  return {
    "courseId": normalized_course_id,
    "sectionId": lecture_row["section_id"],
    "lectureId": normalized_lecture_id,
    "lectureTitle": lecture_row["lecture_title"],
    "questions": [
      {
        "id": question["id"],
        "text": question["text"],
        "type": question["type"],
        "answers": [
          {
            "id": answer["id"],
            "text": answer["text"],
          }
          for answer in question["answers"]
        ],
      }
      for question in questions_with_answers
    ],
    "attempts": attempts,
    "latestAttempt": latest_attempt,
  }


def submit_lecture_quiz_attempt(
  course_id: str,
  lecture_id: str,
  student_id: str,
  selections: list[tuple[str, str]],
) -> dict[str, Any]:
  normalized_course_id = course_id.strip()
  normalized_lecture_id = lecture_id.strip()
  normalized_student_id = student_id.strip()
  if not normalized_course_id or not normalized_lecture_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Course ID and lecture ID are required.")
  if not normalized_student_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Student ID is required.")

  selection_map: dict[str, str] = {}
  for question_id, answer_id in selections:
    normalized_question_id = question_id.strip()
    normalized_answer_id = answer_id.strip()
    if normalized_question_id and normalized_answer_id:
      selection_map[normalized_question_id] = normalized_answer_id

  previous_course_status: str | None = None
  completion_email_payload: dict[str, str] | None = None

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        ensure_student_exists(cursor, normalized_student_id)
        lecture_row = fetch_quiz_lecture(cursor, normalized_course_id, normalized_lecture_id)
        ensure_student_has_course_access(cursor, normalized_course_id, normalized_student_id)
        previous_course_status = get_student_course_status(
          cursor,
          course_id=normalized_course_id,
          student_id=normalized_student_id,
        )

        questions_with_answers = parse_quiz_content(lecture_row.get("content"))
        if not questions_with_answers:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz content is not configured yet.")

        total_questions = len(questions_with_answers)
        score = 0
        results: list[dict[str, Any]] = []

        for question in questions_with_answers:
          question_id = question["id"]
          answer_lookup = {answer["id"]: answer for answer in question["answers"]}
          selected_answer_id = selection_map.get(question_id)
          selected_answer = answer_lookup.get(selected_answer_id) if selected_answer_id else None

          correct_answer_id = question["correctAnswerId"]
          correct_answer = answer_lookup.get(correct_answer_id)
          if not correct_answer:
            continue

          is_correct = selected_answer_id == correct_answer_id
          if is_correct:
            score += 1

          results.append(
            {
              "questionId": question_id,
              "selectedAnswerId": selected_answer_id if selected_answer else None,
              "selectedAnswerText": selected_answer["text"] if selected_answer else None,
              "correctAnswerId": correct_answer_id,
              "correctAnswerText": correct_answer["text"],
              "isCorrect": is_correct,
              "explanation": correct_answer.get("explanation") or "",
            },
          )

        percentage = int(round((score / total_questions) * 100)) if total_questions > 0 else 0
        result_payload = {
          "percentage": percentage,
          "results": results,
        }

        cursor.execute(
          """
          INSERT INTO quiz_attempts (
            course_id,
            lecture_id,
            student_id,
            score,
            total_questions,
            submitted_answers,
            result_json,
            submitted_at
          )
          VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
          RETURNING id, score, total_questions, submitted_at, result_json;
          """,
          (
            normalized_course_id,
            normalized_lecture_id,
            normalized_student_id,
            score,
            total_questions,
            Jsonb(selection_map),
            Jsonb(result_payload),
          ),
        )
        saved_attempt = cursor.fetchone()
        progress_payload = update_student_course_progress_from_completed_lecture(
          cursor,
          course_id=normalized_course_id,
          lecture_id=normalized_lecture_id,
          student_id=normalized_student_id,
        )
        if progress_payload.get("courseStatus") == "completed":
          completion_email_payload = fetch_completion_email_payload(
            cursor,
            course_id=normalized_course_id,
            student_id=normalized_student_id,
          )
      connection.commit()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to submit quiz attempt.",
    ) from error

  attempt_payload = map_latest_attempt_payload(saved_attempt)
  if not attempt_payload:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to process quiz attempt.",
    )
  attempt_payload.update(progress_payload)
  send_completion_email_if_needed(
    course_id=normalized_course_id,
    student_id=normalized_student_id,
    previous_status=previous_course_status,
    current_status=progress_payload.get("courseStatus", ""),
    completion_email_payload=completion_email_payload,
  )

  return attempt_payload


def complete_lecture(course_id: str, lecture_id: str, student_id: str) -> dict[str, Any]:
  normalized_course_id = course_id.strip()
  normalized_lecture_id = lecture_id.strip()
  normalized_student_id = student_id.strip()
  if not normalized_course_id or not normalized_lecture_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Course ID and lecture ID are required.")
  if not normalized_student_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Student ID is required.")

  previous_course_status: str | None = None
  completion_email_payload: dict[str, str] | None = None

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        ensure_student_exists(cursor, normalized_student_id)
        lecture_row = fetch_course_lecture(cursor, normalized_course_id, normalized_lecture_id)
        ensure_student_has_course_access(cursor, normalized_course_id, normalized_student_id)
        previous_course_status = get_student_course_status(
          cursor,
          course_id=normalized_course_id,
          student_id=normalized_student_id,
        )

        progress_payload = update_student_course_progress_from_completed_lecture(
          cursor,
          course_id=normalized_course_id,
          lecture_id=normalized_lecture_id,
          student_id=normalized_student_id,
        )
        if progress_payload.get("courseStatus") == "completed":
          completion_email_payload = fetch_completion_email_payload(
            cursor,
            course_id=normalized_course_id,
            student_id=normalized_student_id,
          )
      connection.commit()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to update lecture progress.",
    ) from error

  send_completion_email_if_needed(
    course_id=normalized_course_id,
    student_id=normalized_student_id,
    previous_status=previous_course_status,
    current_status=progress_payload.get("courseStatus", ""),
    completion_email_payload=completion_email_payload,
  )

  return {
    "courseId": normalized_course_id,
    "lectureId": normalized_lecture_id,
    "lectureTitle": lecture_row["lecture_title"],
    **progress_payload,
  }
