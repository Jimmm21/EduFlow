CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  students_count INTEGER NOT NULL DEFAULT 0 CHECK (students_count >= 0),
  rating NUMERIC(2, 1) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  last_updated DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_sections (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, position)
);

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

CREATE TABLE IF NOT EXISTS student_course_progress (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status TEXT NOT NULL CHECK (status IN ('in-progress', 'completed', 'wishlist')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS student_lecture_progress (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lecture_id TEXT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('in-progress', 'completed')) DEFAULT 'completed',
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, course_id, lecture_id)
);

CREATE TABLE IF NOT EXISTS enrollment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Accepted', 'Rejected')) DEFAULT 'Pending',
  note TEXT,
  UNIQUE (course_id, student_id)
);

CREATE TABLE IF NOT EXISTS course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  UNIQUE (course_id, student_id)
);

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

CREATE TABLE IF NOT EXISTS course_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_sections_course_id ON course_sections(course_id);
CREATE INDEX IF NOT EXISTS idx_lectures_section_id ON lectures(section_id);
CREATE INDEX IF NOT EXISTS idx_progress_user_id ON student_course_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_course_id ON student_course_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_lecture_progress_user_id ON student_lecture_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_lecture_progress_course_id ON student_lecture_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_lecture_progress_lecture_id ON student_lecture_progress(lecture_id);
CREATE INDEX IF NOT EXISTS idx_requests_course_id ON enrollment_requests(course_id);
CREATE INDEX IF NOT EXISTS idx_requests_student_id ON enrollment_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON course_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_course_id ON quiz_attempts(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_lecture_id ON quiz_attempts(lecture_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_id ON quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_course_lecture_student_submitted ON quiz_attempts(course_id, lecture_id, student_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_course_id ON course_reviews(course_id);
CREATE INDEX IF NOT EXISTS idx_reviews_student_id ON course_reviews(student_id);

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_users_updated_at ON app_users;
CREATE TRIGGER trg_app_users_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_courses_updated_at ON courses;
CREATE TRIGGER trg_courses_updated_at
BEFORE UPDATE ON courses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_course_sections_updated_at ON course_sections;
CREATE TRIGGER trg_course_sections_updated_at
BEFORE UPDATE ON course_sections
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_lectures_updated_at ON lectures;
CREATE TRIGGER trg_lectures_updated_at
BEFORE UPDATE ON lectures
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

INSERT INTO app_users (id, name, email, role)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Admin User', 'admin@eduflow.com', 'Admin'),
  ('00000000-0000-0000-0000-000000000002', 'Student User', 'student@eduflow.com', 'Student')
ON CONFLICT (email) DO NOTHING;

INSERT INTO courses (
  id,
  title,
  subtitle,
  description,
  language,
  level,
  category,
  image_url,
  target_students,
  status,
  enrollment_status,
  visibility,
  students_count,
  rating,
  last_updated
)
VALUES (
  'course-react-basics',
  'React Fundamentals',
  'Build interactive web apps from scratch',
  'A starter course for modern React development with routing, state, and component architecture.',
  'English',
  'Beginner',
  'Development',
  'https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=1600&q=80',
  ARRAY['New frontend developers', 'Students transitioning from HTML/CSS/JS basics'],
  'Published',
  'Open',
  'Public',
  1,
  4.8,
  CURRENT_DATE
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO course_sections (id, course_id, title, position)
VALUES
  ('section-react-basics-1', 'course-react-basics', 'Getting Started', 0),
  ('section-react-basics-2', 'course-react-basics', 'Core Concepts', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO lectures (id, section_id, title, content_type, duration_seconds, position, content)
VALUES
  (
    'lecture-react-basics-1',
    'section-react-basics-1',
    'How React Works',
    'Video',
    720,
    0,
    'React renders UI as a tree of reusable components and updates efficiently when state changes.'
  ),
  (
    'lecture-react-basics-2',
    'section-react-basics-2',
    'State and Props',
    'Article',
    480,
    0,
    'Props pass data down the component tree while state manages data that changes over time.'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO course_enrollments (course_id, student_id, progress)
VALUES ('course-react-basics', '00000000-0000-0000-0000-000000000002', 15)
ON CONFLICT (course_id, student_id) DO NOTHING;

INSERT INTO student_course_progress (user_id, course_id, progress, status)
VALUES ('00000000-0000-0000-0000-000000000002', 'course-react-basics', 15, 'in-progress')
ON CONFLICT (user_id, course_id) DO NOTHING;
