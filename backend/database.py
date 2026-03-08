from typing import Any

import psycopg
from psycopg.rows import dict_row

from .config import DATABASE_URL
from .security import hash_password

SEED_USERS = (
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "name": "Admin User",
    "email": "admin@eduflow.com",
    "role": "Admin",
    "password": "Admin@123",
  },
  {
    "id": "00000000-0000-0000-0000-000000000002",
    "name": "Student User",
    "email": "student@eduflow.com",
    "role": "Student",
    "password": "Student@123",
  },
)


def get_connection(row_factory: Any = dict_row) -> psycopg.Connection[Any]:
  return psycopg.connect(DATABASE_URL, row_factory=row_factory)


def ensure_user_table_exists() -> None:
  with get_connection(row_factory=None) as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS app_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL CHECK (role IN ('Admin', 'Student')),
          avatar_url TEXT,
          password_hash TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """,
      )
      cursor.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;")
      for seed_user in SEED_USERS:
        cursor.execute(
          """
          INSERT INTO app_users (id, name, email, role, password_hash)
          VALUES (%s, %s, %s, %s, %s)
          ON CONFLICT (email) DO UPDATE
          SET
            password_hash = COALESCE(app_users.password_hash, EXCLUDED.password_hash),
            name = COALESCE(app_users.name, EXCLUDED.name),
            role = COALESCE(app_users.role, EXCLUDED.role);
          """,
          (
            seed_user["id"],
            seed_user["name"],
            seed_user["email"],
            seed_user["role"],
            hash_password(seed_user["password"]),
          ),
        )
    connection.commit()


def ensure_course_tables_exist() -> None:
  with get_connection(row_factory=None) as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS courses (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          subtitle TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          language TEXT NOT NULL DEFAULT 'English',
          level TEXT NOT NULL CHECK (level IN ('Beginner', 'Intermediate', 'Expert', 'All Levels')),
          category TEXT NOT NULL CHECK (category IN ('Development', 'Business', 'IT & Software', 'Design', 'Marketing', 'Photography')),
          image_url TEXT NOT NULL DEFAULT '',
          promo_video_url TEXT,
          target_students TEXT[] NOT NULL DEFAULT '{}',
          status TEXT NOT NULL CHECK (status IN ('Draft', 'Published')) DEFAULT 'Draft',
          enrollment_status TEXT NOT NULL CHECK (enrollment_status IN ('Open', 'Closed')) DEFAULT 'Open',
          visibility TEXT NOT NULL CHECK (visibility IN ('Public', 'Private')) DEFAULT 'Public',
          welcome_message TEXT NOT NULL DEFAULT '',
          reminder_message TEXT NOT NULL DEFAULT '',
          congratulations_message TEXT NOT NULL DEFAULT '',
          students_count INTEGER NOT NULL DEFAULT 0 CHECK (students_count >= 0),
          rating NUMERIC(2, 1) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
          last_updated DATE NOT NULL DEFAULT CURRENT_DATE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """,
      )
      cursor.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS welcome_message TEXT NOT NULL DEFAULT '';")
      cursor.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS reminder_message TEXT NOT NULL DEFAULT '';")
      cursor.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS congratulations_message TEXT NOT NULL DEFAULT '';")
      cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS course_sections (
          id TEXT PRIMARY KEY,
          course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          position INTEGER NOT NULL CHECK (position >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (course_id, position)
        );
        """,
      )
      cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS lectures (
          id TEXT PRIMARY KEY,
          section_id TEXT NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          content_type TEXT NOT NULL CHECK (content_type IN ('Video', 'Article', 'Quiz', 'Resource')),
          duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
          content TEXT,
          video_url TEXT,
          position INTEGER NOT NULL CHECK (position >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (section_id, position)
        );
        """,
      )
      cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS student_course_progress (
          user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
          status TEXT NOT NULL CHECK (status IN ('in-progress', 'completed', 'wishlist')),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, course_id)
        );
        """,
      )
      cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS student_lecture_progress (
          user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK (status IN ('in-progress', 'completed')) DEFAULT 'completed',
          completed_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, course_id, lecture_id)
        );
        """,
      )
      cursor.execute("CREATE INDEX IF NOT EXISTS idx_lecture_progress_user_id ON student_lecture_progress(user_id);")
      cursor.execute("CREATE INDEX IF NOT EXISTS idx_lecture_progress_course_id ON student_lecture_progress(course_id);")
      cursor.execute("CREATE INDEX IF NOT EXISTS idx_lecture_progress_lecture_id ON student_lecture_progress(lecture_id);")
      cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS enrollment_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          student_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          status TEXT NOT NULL CHECK (status IN ('Pending', 'Accepted', 'Rejected')) DEFAULT 'Pending',
          note TEXT,
          UNIQUE (course_id, student_id)
        );
        """,
      )
      cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS course_enrollments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          student_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
          UNIQUE (course_id, student_id)
        );
        """,
      )
      cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS quiz_attempts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
          student_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
          total_questions INTEGER NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
          submitted_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
          result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """,
      )
      cursor.execute(
        "ALTER TABLE quiz_attempts DROP CONSTRAINT IF EXISTS quiz_attempts_course_id_lecture_id_student_id_key;",
      )
      cursor.execute("CREATE INDEX IF NOT EXISTS idx_quiz_attempts_course_id ON quiz_attempts(course_id);")
      cursor.execute("CREATE INDEX IF NOT EXISTS idx_quiz_attempts_lecture_id ON quiz_attempts(lecture_id);")
      cursor.execute("CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_id ON quiz_attempts(student_id);")
      cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_quiz_attempts_course_lecture_student_submitted
        ON quiz_attempts(course_id, lecture_id, student_id, submitted_at DESC);
        """,
      )
    connection.commit()


def ensure_schema() -> None:
  ensure_user_table_exists()
  ensure_course_tables_exist()
