import logging
import re
import secrets
from typing import Any

import psycopg
from fastapi import HTTPException, status
from psycopg.rows import dict_row

from ..database import get_connection
from ..schemas import CourseResponse, CreateCourseInput, SectionInput
from . import email_service

PUBLIC_COURSE_FILTER = "status = 'Published' AND visibility = 'Public'"
logger = logging.getLogger(__name__)


def slugify(value: str) -> str:
  value = value.strip().lower()
  value = re.sub(r"[^a-z0-9]+", "-", value)
  return value.strip("-")


def make_course_id(title: str) -> str:
  slug = slugify(title) or "course"
  return f"{slug}-{secrets.token_hex(3)}"


def make_section_id(course_id: str, position: int) -> str:
  return f"{course_id}-s{position + 1}"


def make_lecture_id(section_id: str, position: int) -> str:
  return f"{section_id}-l{position + 1}"


def duration_to_seconds(duration: str | None) -> int | None:
  if not duration:
    return None

  parts = duration.strip().split(":")
  if len(parts) == 2 and all(part.isdigit() for part in parts):
    minutes, seconds = (int(parts[0]), int(parts[1]))
    return (minutes * 60) + seconds

  if len(parts) == 3 and all(part.isdigit() for part in parts):
    hours, minutes, seconds = (int(parts[0]), int(parts[1]), int(parts[2]))
    return (hours * 3600) + (minutes * 60) + seconds

  return None


def upsert_course_sections_and_lectures(
  cursor: psycopg.Cursor[dict[str, Any]],
  course_id: str,
  sections: list[SectionInput],
) -> None:
  cursor.execute("DELETE FROM lectures WHERE section_id IN (SELECT id FROM course_sections WHERE course_id = %s);", (course_id,))
  cursor.execute("DELETE FROM course_sections WHERE course_id = %s;", (course_id,))

  for section_index, section in enumerate(sections):
    # Section/lecture IDs are global primary keys in Postgres.
    # Generate deterministic IDs scoped to the course to prevent collisions
    # when frontend drafts reuse default IDs like "s1" and "l1".
    section_id = make_section_id(course_id, section_index)
    cursor.execute(
      """
      INSERT INTO course_sections (id, course_id, title, position)
      VALUES (%s, %s, %s, %s);
      """,
      (section_id, course_id, section.title.strip(), section_index),
    )

    for lecture_index, lecture in enumerate(section.lectures):
      lecture_id = make_lecture_id(section_id, lecture_index)
      cursor.execute(
        """
        INSERT INTO lectures (
          id,
          section_id,
          title,
          content_type,
          duration_seconds,
          content,
          video_url,
          position
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
        """,
        (
          lecture_id,
          section_id,
          lecture.title.strip(),
          lecture.type,
          duration_to_seconds(lecture.duration),
          lecture.content,
          lecture.videoUrl,
          lecture_index,
        ),
      )


def map_course_row(row: dict[str, Any]) -> dict[str, Any]:
  return {
    "id": row["id"],
    "title": row["title"],
    "subtitle": row["subtitle"],
    "description": row["description"],
    "language": row["language"],
    "level": row["level"],
    "category": row["category"],
    "image": row["image_url"],
    "promoVideo": row["promo_video_url"],
    "targetStudents": row["target_students"] or [],
    "status": row["status"],
    "enrollmentStatus": row["enrollment_status"],
    "visibility": row["visibility"],
    "welcomeMessage": row.get("welcome_message") or "",
    "reminderMessage": row.get("reminder_message") or "",
    "congratulationsMessage": row.get("congratulations_message") or "",
    "studentsCount": row["students_count"],
    "rating": float(row["rating"]),
    "lastUpdated": row["last_updated"].isoformat() if row.get("last_updated") else "",
  }


def map_enrollment_request_row(row: dict[str, Any]) -> dict[str, Any]:
  return {
    "id": row["id"],
    "courseId": row["course_id"],
    "courseTitle": row.get("course_title") or "",
    "studentId": row["student_id"],
    "studentName": row["student_name"],
    "studentEmail": row["student_email"],
    "requestedAt": row["requested_at"].date().isoformat() if row.get("requested_at") else "",
    "status": row["status"],
    "note": row.get("note"),
  }


def map_student_enrollment_row(row: dict[str, Any]) -> dict[str, Any]:
  return {
    "id": row["id"],
    "courseId": row["course_id"],
    "courseTitle": row.get("course_title") or "",
    "studentId": row["student_id"],
    "studentName": row["student_name"],
    "studentEmail": row["student_email"],
    "enrolledAt": row["enrolled_at"].date().isoformat() if row.get("enrolled_at") else "",
    "progress": int(row.get("progress") or 0),
    "learningStatus": row.get("learning_status") or "in-progress",
  }


def refresh_course_student_count(cursor: psycopg.Cursor[dict[str, Any]], course_id: str) -> None:
  cursor.execute(
    """
    UPDATE courses
    SET
      students_count = (
        SELECT COUNT(*)
        FROM course_enrollments
        WHERE course_id = %s
      ),
      last_updated = CURRENT_DATE,
      updated_at = NOW()
    WHERE id = %s;
    """,
    (course_id, course_id),
  )


def attach_student_enrollment_state(
  cursor: psycopg.Cursor[dict[str, Any]],
  course: dict[str, Any],
  student_id: str,
) -> None:
  course_id = course["id"]
  cursor.execute(
    """
    SELECT progress, status
    FROM student_course_progress
    WHERE user_id = %s AND course_id = %s;
    """,
    (student_id, course_id),
  )
  progress_row = cursor.fetchone()
  course["isEnrolled"] = progress_row is not None
  if progress_row:
    course["progress"] = progress_row["progress"]
    course["learningStatus"] = progress_row["status"]

  cursor.execute(
    """
    SELECT id, status
    FROM enrollment_requests
    WHERE course_id = %s AND student_id = %s;
    """,
    (course_id, student_id),
  )
  request_row = cursor.fetchone()
  course["hasPendingEnrollmentRequest"] = bool(request_row and request_row["status"] == "Pending")
  if request_row:
    course["enrollmentRequestStatus"] = request_row["status"]

  cursor.execute(
    """
    SELECT lecture_id
    FROM student_lecture_progress
    WHERE user_id = %s AND course_id = %s AND status = 'completed';
    """,
    (student_id, course_id),
  )
  completed_lecture_rows = cursor.fetchall()
  course["completedLectureIds"] = [
    str(row["lecture_id"]).strip()
    for row in completed_lecture_rows
    if row.get("lecture_id")
  ]

  cursor.execute(
    """
    SELECT rating
    FROM course_reviews
    WHERE course_id = %s AND student_id = %s;
    """,
    (course_id, student_id),
  )
  review_row = cursor.fetchone()
  if review_row and review_row.get("rating") is not None:
    course["studentRating"] = int(review_row["rating"])


def fetch_course_by_id(cursor: psycopg.Cursor[dict[str, Any]], course_id: str) -> dict[str, Any] | None:
  return fetch_course_by_id_with_options(cursor, course_id)


def fetch_course_by_id_with_options(
  cursor: psycopg.Cursor[dict[str, Any]],
  course_id: str,
  *,
  public_only: bool = False,
  student_id: str | None = None,
) -> dict[str, Any] | None:
  course_query = """
    SELECT
      id,
      title,
      subtitle,
      description,
      language,
      level,
      category,
      image_url,
      promo_video_url,
      target_students,
      status,
      enrollment_status,
      visibility,
      welcome_message,
      reminder_message,
      congratulations_message,
      students_count,
      rating,
      last_updated
    FROM courses
    WHERE id = %s
  """
  params: list[Any] = [course_id]
  if public_only:
    course_query += f" AND {PUBLIC_COURSE_FILTER}"

  cursor.execute(f"{course_query};", params)
  row = cursor.fetchone()
  if not row:
    return None

  course = map_course_row(row)

  cursor.execute(
    """
    SELECT id, title, position
    FROM course_sections
    WHERE course_id = %s
    ORDER BY position ASC;
    """,
    (course_id,),
  )
  section_rows = cursor.fetchall()

  sections: list[dict[str, Any]] = []
  for section_row in section_rows:
    cursor.execute(
      """
      SELECT id, title, content_type, duration_seconds, content, video_url, position
      FROM lectures
      WHERE section_id = %s
      ORDER BY position ASC;
      """,
      (section_row["id"],),
    )
    lecture_rows = cursor.fetchall()
    lectures = [
      {
        "id": lecture_row["id"],
        "title": lecture_row["title"],
        "type": lecture_row["content_type"],
        "duration": (
          f"{lecture_row['duration_seconds'] // 60:02d}:{lecture_row['duration_seconds'] % 60:02d}"
          if lecture_row["duration_seconds"] is not None
          else None
        ),
        "content": lecture_row["content"],
        "videoUrl": lecture_row["video_url"],
      }
      for lecture_row in lecture_rows
    ]
    sections.append(
      {
        "id": section_row["id"],
        "title": section_row["title"],
        "lectures": lectures,
      },
    )

  course["sections"] = sections
  if student_id:
    attach_student_enrollment_state(cursor, course, student_id)

  return course


def create_course(payload: CreateCourseInput) -> CourseResponse:
  title = payload.title.strip()
  if not title:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Course title is required.")

  course_id = make_course_id(title)

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          """
          INSERT INTO courses (
            id,
            title,
            subtitle,
            description,
            language,
            level,
            category,
            image_url,
            promo_video_url,
            target_students,
            status,
            enrollment_status,
            visibility,
            welcome_message,
            reminder_message,
            congratulations_message,
            last_updated
          )
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_DATE);
          """,
          (
            course_id,
            title,
            payload.subtitle.strip(),
            payload.description.strip(),
            payload.language.strip(),
            payload.level,
            payload.category,
            payload.image.strip(),
            payload.promoVideo.strip() if payload.promoVideo else None,
            payload.targetStudents,
            payload.status,
            payload.enrollmentStatus,
            payload.visibility,
            payload.welcomeMessage.strip(),
            payload.reminderMessage.strip(),
            payload.congratulationsMessage.strip(),
          ),
        )

        upsert_course_sections_and_lectures(cursor, course_id, payload.sections)
        created_course = fetch_course_by_id(cursor, course_id)
      connection.commit()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to create course.",
    ) from error

  return CourseResponse(success=True, course=created_course)


def get_course(course_id: str) -> CourseResponse:
  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        course = fetch_course_by_id(cursor, course_id)
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to fetch course.",
    ) from error

  if not course:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")

  return CourseResponse(success=True, course=course)


def list_courses() -> CourseResponse:
  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          """
          SELECT
            id,
            title,
            subtitle,
            description,
            language,
            level,
            category,
            image_url,
            promo_video_url,
            target_students,
            status,
            enrollment_status,
            visibility,
            students_count,
            rating,
            last_updated
          FROM courses
          ORDER BY created_at DESC;
          """,
        )
        course_rows = cursor.fetchall()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to fetch courses.",
    ) from error

  courses = []
  for row in course_rows:
    course = map_course_row(row)
    course["sections"] = []
    courses.append(course)

  return CourseResponse(success=True, courses=courses)


def get_admin_performance() -> dict[str, Any]:
  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          """
          WITH latest_attempt_per_lecture AS (
            SELECT DISTINCT ON (qa.student_id, qa.course_id, qa.lecture_id)
              qa.student_id,
              qa.course_id,
              qa.lecture_id,
              qa.score,
              qa.total_questions,
              qa.submitted_at
            FROM quiz_attempts qa
            ORDER BY qa.student_id, qa.course_id, qa.lecture_id, qa.submitted_at DESC
          ),
          student_quiz_scores AS (
            SELECT
              lapl.student_id,
              AVG(
                CASE
                  WHEN lapl.total_questions > 0 THEN (lapl.score::numeric / lapl.total_questions::numeric) * 100
                  ELSE 0
                END
              ) AS avg_quiz_score,
              COUNT(*) AS quizzes_taken
            FROM latest_attempt_per_lecture lapl
            GROUP BY lapl.student_id
          ),
          completed_course_totals AS (
            SELECT
              scp.user_id AS student_id,
              COUNT(*) FILTER (WHERE scp.status = 'completed') AS courses_completed
            FROM student_course_progress scp
            GROUP BY scp.user_id
          )
          SELECT
            u.id::text AS student_id,
            u.name AS student_name,
            COALESCE(cct.courses_completed, 0) AS courses_completed,
            ROUND(COALESCE(sqs.avg_quiz_score, 0), 1) AS avg_quiz_score,
            COALESCE(sqs.quizzes_taken, 0) AS quizzes_taken
          FROM app_users u
          INNER JOIN student_quiz_scores sqs ON sqs.student_id = u.id
          LEFT JOIN completed_course_totals cct ON cct.student_id = u.id
          WHERE u.role = 'Student'
          ORDER BY sqs.avg_quiz_score DESC, sqs.quizzes_taken DESC, u.name ASC
          LIMIT 5;
          """,
        )
        top_student_rows = cursor.fetchall()

        cursor.execute(
          """
          WITH enrollment_totals AS (
            SELECT
              ce.course_id,
              COUNT(*) AS enrollments
            FROM course_enrollments ce
            GROUP BY ce.course_id
          ),
          review_totals AS (
            SELECT
              cr.course_id,
              ROUND(AVG(cr.rating::numeric), 1) AS rating
            FROM course_reviews cr
            GROUP BY cr.course_id
          )
          SELECT
            c.id AS course_id,
            c.title,
            c.category,
            COALESCE(et.enrollments, 0) AS enrollments,
            COALESCE(rt.rating, c.rating::numeric, 0) AS rating
          FROM courses c
          LEFT JOIN enrollment_totals et ON et.course_id = c.id
          LEFT JOIN review_totals rt ON rt.course_id = c.id
          WHERE c.status = 'Published' AND c.visibility = 'Public'
          ORDER BY COALESCE(et.enrollments, 0) DESC, COALESCE(rt.rating, c.rating::numeric, 0) DESC, c.title ASC
          LIMIT 5;
          """,
        )
        popular_course_rows = cursor.fetchall()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to fetch performance analytics.",
    ) from error

  top_students = [
    {
      "studentId": row["student_id"],
      "studentName": row["student_name"],
      "coursesCompleted": int(row["courses_completed"] or 0),
      "avgQuizScore": float(row["avg_quiz_score"] or 0),
      "quizzesTaken": int(row["quizzes_taken"] or 0),
    }
    for row in top_student_rows
  ]

  popular_courses = [
    {
      "courseId": row["course_id"],
      "title": row["title"],
      "category": row["category"],
      "enrollments": int(row["enrollments"] or 0),
      "rating": float(row["rating"] or 0),
    }
    for row in popular_course_rows
  ]

  return {
    "topStudents": top_students,
    "popularCourses": popular_courses,
  }


def list_public_courses() -> CourseResponse:
  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          f"""
          SELECT
            id,
            title,
            subtitle,
            description,
            language,
            level,
            category,
            image_url,
            promo_video_url,
            target_students,
            status,
            enrollment_status,
            visibility,
            students_count,
            rating,
            last_updated
          FROM courses
          WHERE {PUBLIC_COURSE_FILTER}
          ORDER BY created_at DESC;
          """,
        )
        course_rows = cursor.fetchall()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to fetch courses.",
    ) from error

  courses = []
  for row in course_rows:
    course = map_course_row(row)
    course["sections"] = []
    course["isEnrolled"] = False
    courses.append(course)

  return CourseResponse(success=True, courses=courses)


def list_enrollment_requests(course_id: str | None = None) -> list[dict[str, Any]]:
  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        base_query = """
          SELECT
            er.id::text AS id,
            er.course_id,
            c.title AS course_title,
            er.student_id::text AS student_id,
            u.name AS student_name,
            u.email AS student_email,
            er.requested_at,
            er.status,
            er.note
          FROM enrollment_requests er
          INNER JOIN courses c ON c.id = er.course_id
          INNER JOIN app_users u ON u.id = er.student_id
        """
        params: list[Any] = []
        if course_id:
          base_query += " WHERE er.course_id = %s"
          params.append(course_id)
        base_query += " ORDER BY er.requested_at DESC;"

        cursor.execute(base_query, params)
        request_rows = cursor.fetchall()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to fetch enrollment requests.",
    ) from error

  return [map_enrollment_request_row(row) for row in request_rows]


def list_student_enrollments(course_id: str | None = None) -> list[dict[str, Any]]:
  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        base_query = """
          SELECT
            ce.id::text AS id,
            ce.course_id,
            c.title AS course_title,
            ce.student_id::text AS student_id,
            u.name AS student_name,
            u.email AS student_email,
            ce.enrolled_at,
            COALESCE(scp.progress, ce.progress, 0) AS progress,
            COALESCE(
              scp.status,
              CASE WHEN COALESCE(scp.progress, ce.progress, 0) >= 100 THEN 'completed' ELSE 'in-progress' END
            ) AS learning_status
          FROM course_enrollments ce
          INNER JOIN courses c ON c.id = ce.course_id
          INNER JOIN app_users u ON u.id = ce.student_id
          LEFT JOIN student_course_progress scp
            ON scp.user_id = ce.student_id
            AND scp.course_id = ce.course_id
        """
        params: list[Any] = []
        if course_id:
          base_query += " WHERE ce.course_id = %s"
          params.append(course_id)
        base_query += " ORDER BY ce.enrolled_at DESC, u.name ASC;"

        cursor.execute(base_query, params)
        enrollment_rows = cursor.fetchall()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to fetch enrolled students.",
    ) from error

  return [map_student_enrollment_row(row) for row in enrollment_rows]


def remove_student_enrollment(enrollment_id: str) -> dict[str, str]:
  normalized_enrollment_id = enrollment_id.strip()
  if not normalized_enrollment_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enrollment ID is required.")

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          """
          SELECT
            ce.id::text AS id,
            ce.course_id,
            ce.student_id::text AS student_id,
            c.title AS course_title,
            u.name AS student_name
          FROM course_enrollments ce
          INNER JOIN courses c ON c.id = ce.course_id
          INNER JOIN app_users u ON u.id = ce.student_id
          WHERE ce.id::text = %s;
          """,
          (normalized_enrollment_id,),
        )
        enrollment_row = cursor.fetchone()
        if not enrollment_row:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student enrollment not found.")

        course_id = enrollment_row["course_id"]
        student_id = enrollment_row["student_id"]

        cursor.execute(
          """
          DELETE FROM student_lecture_progress
          WHERE course_id = %s AND user_id = %s;
          """,
          (course_id, student_id),
        )
        cursor.execute(
          """
          DELETE FROM student_course_progress
          WHERE course_id = %s AND user_id = %s;
          """,
          (course_id, student_id),
        )
        cursor.execute(
          """
          DELETE FROM course_enrollments
          WHERE id::text = %s;
          """,
          (normalized_enrollment_id,),
        )
        cursor.execute(
          """
          UPDATE enrollment_requests
          SET
            status = 'Rejected',
            note = 'Removed by admin.'
          WHERE course_id = %s AND student_id = %s;
          """,
          (course_id, student_id),
        )
        refresh_course_student_count(cursor, course_id)
      connection.commit()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to remove student enrollment.",
    ) from error

  return {
    "studentName": str(enrollment_row.get("student_name") or "Student"),
    "courseTitle": str(enrollment_row.get("course_title") or "the course"),
  }


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


def get_public_course(course_id: str, student_id: str | None = None) -> CourseResponse:
  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        course = fetch_course_by_id_with_options(
          cursor,
          course_id,
          public_only=True,
          student_id=student_id.strip() if student_id else None,
        )
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to fetch course.",
    ) from error

  if not course:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")

  return CourseResponse(success=True, course=course)


def enroll_in_course(course_id: str, student_id: str) -> CourseResponse:
  normalized_student_id = student_id.strip()
  if not normalized_student_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Student ID is required.")

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        ensure_student_exists(cursor, normalized_student_id)

        course = fetch_course_by_id_with_options(cursor, course_id, public_only=True, student_id=normalized_student_id)
        if not course:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")
        if course["enrollmentStatus"] != "Open":
          raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enrollment is closed for this course.")

        cursor.execute(
          """
          INSERT INTO enrollment_requests (course_id, student_id, status)
          VALUES (%s, %s, 'Pending')
          ON CONFLICT (course_id, student_id) DO UPDATE
          SET
            status = CASE
              WHEN enrollment_requests.status = 'Accepted' THEN 'Accepted'
              ELSE 'Pending'
            END,
            requested_at = CASE
              WHEN enrollment_requests.status = 'Accepted' THEN enrollment_requests.requested_at
              ELSE NOW()
            END,
            note = CASE
              WHEN enrollment_requests.status = 'Accepted' THEN enrollment_requests.note
              ELSE NULL
            END
          RETURNING status;
          """,
          (course_id, normalized_student_id),
        )
        request_row = cursor.fetchone()
        request_status = request_row["status"] if request_row else "Pending"

        updated_course = fetch_course_by_id_with_options(
          cursor,
          course_id,
          public_only=True,
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
      detail="Unable to enroll in course.",
    ) from error

  return CourseResponse(
    success=True,
    course=updated_course,
    message=(
      "Already enrolled in this course."
      if request_status == "Accepted"
      else "Enrollment request submitted. Waiting for admin approval."
    ),
  )


def submit_course_rating(course_id: str, student_id: str, rating: int) -> CourseResponse:
  normalized_course_id = course_id.strip()
  normalized_student_id = student_id.strip()
  if not normalized_course_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Course ID is required.")
  if not normalized_student_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Student ID is required.")
  if rating < 1 or rating > 5:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rating must be between 1 and 5.")

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        ensure_student_exists(cursor, normalized_student_id)

        course = fetch_course_by_id_with_options(
          cursor,
          normalized_course_id,
          public_only=True,
          student_id=normalized_student_id,
        )
        if not course:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")

        cursor.execute(
          """
          SELECT status
          FROM student_course_progress
          WHERE user_id = %s AND course_id = %s;
          """,
          (normalized_student_id, normalized_course_id),
        )
        progress_row = cursor.fetchone()
        if not progress_row or progress_row["status"] != "completed":
          raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can only rate a course after completing it.",
          )

        cursor.execute(
          """
          INSERT INTO course_reviews (course_id, student_id, rating, comment, submitted_at)
          VALUES (%s, %s, %s, %s, NOW())
          ON CONFLICT (course_id, student_id) DO NOTHING
          RETURNING id;
          """,
          (normalized_course_id, normalized_student_id, rating, ""),
        )
        inserted_review = cursor.fetchone()
        if not inserted_review:
          raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already submitted a rating for this course.",
          )

        cursor.execute(
          """
          UPDATE courses
          SET
            rating = COALESCE((
              SELECT ROUND(AVG(cr.rating::numeric), 1)
              FROM course_reviews cr
              WHERE cr.course_id = %s
            ), 0),
            last_updated = CURRENT_DATE,
            updated_at = NOW()
          WHERE id = %s;
          """,
          (normalized_course_id, normalized_course_id),
        )

        updated_course = fetch_course_by_id_with_options(
          cursor,
          normalized_course_id,
          public_only=True,
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
      detail="Unable to save course rating.",
    ) from error

  return CourseResponse(success=True, course=updated_course, message="Course rating saved.")


def list_student_learning_courses(student_id: str) -> CourseResponse:
  normalized_student_id = student_id.strip()
  if not normalized_student_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Student ID is required.")

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        ensure_student_exists(cursor, normalized_student_id)
        cursor.execute(
          """
          SELECT
            c.id,
            c.title,
            c.subtitle,
            c.description,
            c.language,
            c.level,
            c.category,
            c.image_url,
            c.promo_video_url,
            c.target_students,
            c.status,
            c.enrollment_status,
            c.visibility,
            c.students_count,
            c.rating,
            c.last_updated,
            scp.progress,
            scp.status AS learning_status
          FROM student_course_progress scp
          INNER JOIN courses c ON c.id = scp.course_id
          WHERE scp.user_id = %s
          ORDER BY scp.updated_at DESC, c.created_at DESC;
          """,
          (normalized_student_id,),
        )
        course_rows = cursor.fetchall()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to fetch learning courses.",
    ) from error

  courses = []
  for row in course_rows:
    course = map_course_row(row)
    course["sections"] = []
    course["isEnrolled"] = True
    course["progress"] = row["progress"]
    course["learningStatus"] = row["learning_status"]
    courses.append(course)

  return CourseResponse(success=True, courses=courses)


def update_enrollment_request_status(request_id: str, next_status: str) -> dict[str, Any]:
  normalized_request_id = request_id.strip()
  if not normalized_request_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request ID is required.")

  if next_status not in {"Pending", "Accepted", "Rejected"}:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid enrollment request status.")

  should_send_welcome_email = False
  hydrated_request: dict[str, Any] | None = None
  welcome_email_payload: dict[str, str] | None = None

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          """
          SELECT id::text AS id, course_id, student_id::text AS student_id, status
          FROM enrollment_requests
          WHERE id::text = %s;
          """,
          (normalized_request_id,),
        )
        existing_request = cursor.fetchone()
        if not existing_request:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment request not found.")

        if next_status in {"Accepted", "Rejected"} and existing_request["status"] != "Pending":
          raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending enrollment requests can be accepted or rejected.",
          )

        if next_status == existing_request["status"]:
          raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Enrollment request is already {next_status}.",
          )

        cursor.execute(
          """
          UPDATE enrollment_requests
          SET status = %s
          WHERE id::text = %s
          RETURNING id::text AS id, course_id, student_id::text AS student_id, requested_at, status, note;
          """,
          (next_status, normalized_request_id),
        )
        updated_request = cursor.fetchone()

        course_id = updated_request["course_id"]
        student_id = updated_request["student_id"]
        # Trigger welcome email whenever admin applies Accepted.
        should_send_welcome_email = next_status == "Accepted"

        if next_status == "Accepted":
          cursor.execute(
            """
            INSERT INTO course_enrollments (course_id, student_id, progress)
            VALUES (%s, %s, 0)
            ON CONFLICT (course_id, student_id) DO NOTHING;
            """,
            (course_id, student_id),
          )
          cursor.execute(
            """
            INSERT INTO student_course_progress (user_id, course_id, progress, status)
            VALUES (%s, %s, 0, 'in-progress')
            ON CONFLICT (user_id, course_id) DO NOTHING;
            """,
            (student_id, course_id),
          )
          refresh_course_student_count(cursor, course_id)
        elif next_status == "Rejected" and existing_request["status"] == "Accepted":
          cursor.execute(
            """
            DELETE FROM course_enrollments
            WHERE course_id = %s AND student_id = %s;
            """,
            (course_id, student_id),
          )
          cursor.execute(
            """
            DELETE FROM student_course_progress
            WHERE course_id = %s AND user_id = %s;
            """,
            (course_id, student_id),
          )
          refresh_course_student_count(cursor, course_id)

        cursor.execute(
          """
          SELECT
            er.id::text AS id,
            er.course_id,
            c.title AS course_title,
            er.student_id::text AS student_id,
            u.name AS student_name,
            u.email AS student_email,
            c.welcome_message AS course_welcome_message,
            er.requested_at,
            er.status,
            er.note
          FROM enrollment_requests er
          INNER JOIN courses c ON c.id = er.course_id
          INNER JOIN app_users u ON u.id = er.student_id
          WHERE er.id::text = %s;
          """,
          (normalized_request_id,),
        )
        hydrated_request = cursor.fetchone()
        if not hydrated_request:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment request not found.")

        if should_send_welcome_email:
          welcome_email_payload = {
            "student_email": str(hydrated_request.get("student_email") or "").strip(),
            "course_title": str(hydrated_request.get("course_title") or "").strip(),
            "welcome_message": str(hydrated_request.get("course_welcome_message") or "").strip(),
          }
      connection.commit()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to update enrollment request.",
    ) from error

  if should_send_welcome_email and welcome_email_payload:
    try:
      sent, email_error = email_service.send_course_welcome_email(
        student_email=welcome_email_payload["student_email"],
        course_title=welcome_email_payload["course_title"],
        welcome_message=welcome_email_payload["welcome_message"],
      )
      if not sent:
        logger.warning(
          "Welcome email was not sent for enrollment request %s: %s",
          normalized_request_id,
          email_error or "Unknown Gmail API error.",
        )
      else:
        logger.info(
          "Welcome email sent for enrollment request %s to %s.",
          normalized_request_id,
          welcome_email_payload["student_email"],
        )
    except Exception:
      logger.exception("Unexpected error while sending welcome email for enrollment request %s", normalized_request_id)

  if not hydrated_request:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment request not found.")

  return map_enrollment_request_row(hydrated_request)


def delete_course(course_id: str) -> CourseResponse:
  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        cursor.execute("DELETE FROM courses WHERE id = %s;", (course_id,))
        if cursor.rowcount == 0:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")
      connection.commit()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to delete course.",
    ) from error

  return CourseResponse(success=True, message="Course deleted.")


def update_course(course_id: str, payload: CreateCourseInput) -> CourseResponse:
  title = payload.title.strip()
  if not title:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Course title is required.")

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          """
          UPDATE courses
          SET
            title = %s,
            subtitle = %s,
            description = %s,
            language = %s,
            level = %s,
            category = %s,
            image_url = %s,
            promo_video_url = %s,
            target_students = %s,
            status = %s,
            enrollment_status = %s,
            visibility = %s,
            welcome_message = %s,
            reminder_message = %s,
            congratulations_message = %s,
            last_updated = CURRENT_DATE,
            updated_at = NOW()
          WHERE id = %s;
          """,
          (
            title,
            payload.subtitle.strip(),
            payload.description.strip(),
            payload.language.strip(),
            payload.level,
            payload.category,
            payload.image.strip(),
            payload.promoVideo.strip() if payload.promoVideo else None,
            payload.targetStudents,
            payload.status,
            payload.enrollmentStatus,
            payload.visibility,
            payload.welcomeMessage.strip(),
            payload.reminderMessage.strip(),
            payload.congratulationsMessage.strip(),
            course_id,
          ),
        )

        if cursor.rowcount == 0:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")

        upsert_course_sections_and_lectures(cursor, course_id, payload.sections)
        updated_course = fetch_course_by_id(cursor, course_id)
      connection.commit()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to update course.",
    ) from error

  return CourseResponse(success=True, course=updated_course)
