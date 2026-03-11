import type {
  AdminStudentEnrollment,
  AdminPerformanceMetrics,
  AdminPopularCourseMetric,
  AdminTopStudentMetric,
  ContentType,
  Course,
  EnrollmentRequest,
  EnrollmentRequestStatus,
  LectureProgress,
  LearningStatus,
  Lecture,
  LectureQuiz,
  QuizAttempt,
  QuizAttemptQuestionResult,
  QuizQuestion,
  QuizQuestionType,
  Section,
} from '../types';
import { API_BASE_URL } from './apiBase';

export const COURSE_API_BASE_URL = API_BASE_URL;

const isLearningStatus = (value: unknown): value is LearningStatus =>
  value === 'in-progress' || value === 'completed' || value === 'wishlist';

const isContentType = (value: unknown): value is ContentType =>
  value === 'Video' || value === 'Article' || value === 'Quiz' || value === 'Resource';

const isQuizQuestionType = (value: unknown): value is QuizQuestionType =>
  value === 'Multiple Choice' || value === 'True / False';

const normalizeAssetUrl = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim();
  if (!normalized || normalized.startsWith('uploaded://')) {
    return '';
  }

  return normalized;
};

const normalizeOptionalAssetUrl = (value: unknown): string | undefined => {
  const normalized = normalizeAssetUrl(value);
  return normalized || undefined;
};

const normalizeLecture = (value: unknown): Lecture | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.title !== 'string' ||
    !isContentType(record.type)
  ) {
    return null;
  }

  return {
    id: record.id,
    title: record.title,
    type: record.type,
    duration: typeof record.duration === 'string' ? record.duration : undefined,
    content: typeof record.content === 'string' ? record.content : undefined,
    videoUrl: typeof record.videoUrl === 'string' ? record.videoUrl : undefined,
  };
};

const normalizeAdminTopStudentMetric = (value: unknown): AdminTopStudentMetric | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.studentId !== 'string' ||
    typeof record.studentName !== 'string' ||
    typeof record.coursesCompleted !== 'number' ||
    typeof record.avgQuizScore !== 'number' ||
    typeof record.quizzesTaken !== 'number'
  ) {
    return null;
  }

  return {
    studentId: record.studentId,
    studentName: record.studentName,
    coursesCompleted: record.coursesCompleted,
    avgQuizScore: record.avgQuizScore,
    quizzesTaken: record.quizzesTaken,
  };
};

const normalizeAdminPopularCourseMetric = (value: unknown): AdminPopularCourseMetric | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.courseId !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.category !== 'string' ||
    typeof record.enrollments !== 'number' ||
    typeof record.rating !== 'number'
  ) {
    return null;
  }

  return {
    courseId: record.courseId,
    title: record.title,
    category: record.category,
    enrollments: record.enrollments,
    rating: record.rating,
  };
};

const normalizeAdminPerformanceMetrics = (value: unknown): AdminPerformanceMetrics | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.topStudents) || !Array.isArray(record.popularCourses)) {
    return null;
  }

  return {
    topStudents: record.topStudents
      .map(normalizeAdminTopStudentMetric)
      .filter((student): student is AdminTopStudentMetric => student !== null),
    popularCourses: record.popularCourses
      .map(normalizeAdminPopularCourseMetric)
      .filter((course): course is AdminPopularCourseMetric => course !== null),
  };
};

const normalizeSection = (value: unknown): Section | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.title !== 'string' || !Array.isArray(record.lectures)) {
    return null;
  }

  return {
    id: record.id,
    title: record.title,
    lectures: record.lectures.map(normalizeLecture).filter((lecture): lecture is Lecture => lecture !== null),
  };
};

const normalizeCourse = (value: unknown): Course | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.subtitle !== 'string' ||
    typeof record.description !== 'string' ||
    typeof record.language !== 'string' ||
    typeof record.level !== 'string' ||
    typeof record.category !== 'string' ||
    typeof record.image !== 'string' ||
    !Array.isArray(record.targetStudents) ||
    !Array.isArray(record.sections)
  ) {
    return null;
  }

  return {
    id: record.id,
    title: record.title,
    subtitle: record.subtitle,
    description: record.description,
    language: record.language,
    level: record.level as Course['level'],
    category: record.category as Course['category'],
    image: normalizeAssetUrl(record.image),
    promoVideo: normalizeOptionalAssetUrl(record.promoVideo),
    targetStudents: record.targetStudents.filter((item): item is string => typeof item === 'string'),
    sections: record.sections.map(normalizeSection).filter((section): section is Section => section !== null),
    status: record.status === 'Published' ? 'Published' : 'Draft',
    enrollmentStatus: record.enrollmentStatus === 'Closed' ? 'Closed' : 'Open',
    visibility: record.visibility === 'Private' ? 'Private' : 'Public',
    welcomeMessage: typeof record.welcomeMessage === 'string' ? record.welcomeMessage : undefined,
    reminderMessage: typeof record.reminderMessage === 'string' ? record.reminderMessage : undefined,
    congratulationsMessage: typeof record.congratulationsMessage === 'string' ? record.congratulationsMessage : undefined,
    studentsCount: typeof record.studentsCount === 'number' ? record.studentsCount : 0,
    rating: typeof record.rating === 'number' ? record.rating : 0,
    lastUpdated: typeof record.lastUpdated === 'string' ? record.lastUpdated : '',
    isEnrolled: record.isEnrolled === true,
    hasPendingEnrollmentRequest: record.hasPendingEnrollmentRequest === true,
    enrollmentRequestStatus:
      record.enrollmentRequestStatus === 'Accepted' ||
      record.enrollmentRequestStatus === 'Pending' ||
      record.enrollmentRequestStatus === 'Rejected'
        ? record.enrollmentRequestStatus
        : undefined,
    progress: typeof record.progress === 'number' ? record.progress : undefined,
    learningStatus: isLearningStatus(record.learningStatus) ? record.learningStatus : undefined,
    completedLectureIds: Array.isArray(record.completedLectureIds)
      ? record.completedLectureIds.filter((item): item is string => typeof item === 'string')
      : undefined,
    studentRating: typeof record.studentRating === 'number' ? record.studentRating : undefined,
  };
};

const normalizeEnrollmentRequest = (value: unknown): EnrollmentRequest | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.courseId !== 'string' ||
    typeof record.studentName !== 'string' ||
    typeof record.studentEmail !== 'string' ||
    typeof record.requestedAt !== 'string' ||
    (record.status !== 'Pending' && record.status !== 'Accepted' && record.status !== 'Rejected')
  ) {
    return null;
  }

  return {
    id: record.id,
    courseId: record.courseId,
    courseTitle: typeof record.courseTitle === 'string' ? record.courseTitle : undefined,
    studentId: typeof record.studentId === 'string' ? record.studentId : undefined,
    studentName: record.studentName,
    studentEmail: record.studentEmail,
    requestedAt: record.requestedAt,
    status: record.status,
    note: typeof record.note === 'string' ? record.note : undefined,
  };
};

const normalizeAdminStudentEnrollment = (value: unknown): AdminStudentEnrollment | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.courseId !== 'string' ||
    typeof record.courseTitle !== 'string' ||
    typeof record.studentId !== 'string' ||
    typeof record.studentName !== 'string' ||
    typeof record.studentEmail !== 'string' ||
    typeof record.enrolledAt !== 'string' ||
    typeof record.progress !== 'number' ||
    !isLearningStatus(record.learningStatus)
  ) {
    return null;
  }

  return {
    id: record.id,
    courseId: record.courseId,
    courseTitle: record.courseTitle,
    studentId: record.studentId,
    studentName: record.studentName,
    studentEmail: record.studentEmail,
    enrolledAt: record.enrolledAt,
    progress: record.progress,
    learningStatus: record.learningStatus,
    studentRating: typeof record.studentRating === 'number' ? record.studentRating : undefined,
  };
};

const normalizeQuizQuestion = (value: unknown): QuizQuestion | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.text !== 'string' ||
    !isQuizQuestionType(record.type) ||
    !Array.isArray(record.answers)
  ) {
    return null;
  }

  const answers = record.answers
    .map((answer) => {
      if (!answer || typeof answer !== 'object') {
        return null;
      }

      const answerRecord = answer as Record<string, unknown>;
      if (typeof answerRecord.id !== 'string' || typeof answerRecord.text !== 'string') {
        return null;
      }

      const id = answerRecord.id.trim();
      const text = answerRecord.text.trim();
      if (!id || !text) {
        return null;
      }

      return { id, text };
    })
    .filter((answer): answer is QuizQuestion['answers'][number] => answer !== null);

  if (answers.length < 2) {
    return null;
  }

  return {
    id: record.id,
    text: record.text,
    type: record.type,
    answers,
  };
};

const normalizeQuizAttemptQuestionResult = (value: unknown): QuizAttemptQuestionResult | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.questionId !== 'string' ||
    typeof record.correctAnswerId !== 'string' ||
    typeof record.correctAnswerText !== 'string' ||
    typeof record.isCorrect !== 'boolean'
  ) {
    return null;
  }

  return {
    questionId: record.questionId,
    selectedAnswerId: typeof record.selectedAnswerId === 'string' ? record.selectedAnswerId : undefined,
    selectedAnswerText: typeof record.selectedAnswerText === 'string' ? record.selectedAnswerText : undefined,
    correctAnswerId: record.correctAnswerId,
    correctAnswerText: record.correctAnswerText,
    isCorrect: record.isCorrect,
    explanation: typeof record.explanation === 'string' ? record.explanation : undefined,
  };
};

const normalizeQuizAttempt = (value: unknown): QuizAttempt | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.score !== 'number' ||
    typeof record.totalQuestions !== 'number' ||
    typeof record.percentage !== 'number' ||
    typeof record.submittedAt !== 'string' ||
    !Array.isArray(record.results)
  ) {
    return null;
  }

  return {
    attemptId: typeof record.attemptId === 'string' ? record.attemptId : undefined,
    score: record.score,
    totalQuestions: record.totalQuestions,
    percentage: record.percentage,
    submittedAt: record.submittedAt,
    courseProgress: typeof record.courseProgress === 'number' ? record.courseProgress : undefined,
    completedSections: typeof record.completedSections === 'number' ? record.completedSections : undefined,
    totalSections: typeof record.totalSections === 'number' ? record.totalSections : undefined,
    completedLectures: typeof record.completedLectures === 'number' ? record.completedLectures : undefined,
    totalLectures: typeof record.totalLectures === 'number' ? record.totalLectures : undefined,
    courseStatus: isLearningStatus(record.courseStatus) ? record.courseStatus : undefined,
    results: record.results
      .map(normalizeQuizAttemptQuestionResult)
      .filter((result): result is QuizAttemptQuestionResult => result !== null),
  };
};

const normalizeLectureQuiz = (value: unknown): LectureQuiz | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.courseId !== 'string' ||
    typeof record.sectionId !== 'string' ||
    typeof record.lectureId !== 'string' ||
    typeof record.lectureTitle !== 'string' ||
    !Array.isArray(record.questions)
  ) {
    return null;
  }

  const questions = record.questions
    .map(normalizeQuizQuestion)
    .filter((question): question is QuizQuestion => question !== null);
  if (questions.length === 0) {
    return null;
  }

  const attempts = Array.isArray(record.attempts)
    ? record.attempts
      .map(normalizeQuizAttempt)
      .filter((attempt): attempt is QuizAttempt => attempt !== null)
    : [];

  const latestAttempt = normalizeQuizAttempt(record.latestAttempt) ?? attempts[0] ?? undefined;

  return {
    courseId: record.courseId,
    sectionId: record.sectionId,
    lectureId: record.lectureId,
    lectureTitle: record.lectureTitle,
    questions,
    attempts: attempts.length > 0 ? attempts : (latestAttempt ? [latestAttempt] : []),
    latestAttempt,
  };
};

const normalizeLectureProgress = (value: unknown): LectureProgress | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.courseId !== 'string' ||
    typeof record.lectureId !== 'string' ||
    typeof record.lectureTitle !== 'string' ||
    typeof record.courseProgress !== 'number' ||
    typeof record.completedSections !== 'number' ||
    typeof record.totalSections !== 'number' ||
    typeof record.completedLectures !== 'number' ||
    typeof record.totalLectures !== 'number' ||
    !isLearningStatus(record.courseStatus)
  ) {
    return null;
  }

  return {
    courseId: record.courseId,
    lectureId: record.lectureId,
    lectureTitle: record.lectureTitle,
    courseProgress: record.courseProgress,
    completedSections: record.completedSections,
    totalSections: record.totalSections,
    completedLectures: record.completedLectures,
    totalLectures: record.totalLectures,
    courseStatus: record.courseStatus,
  };
};

export const extractApiMessage = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.message === 'string') {
    return record.message;
  }

  if (typeof record.detail === 'string') {
    return record.detail;
  }

  if (Array.isArray(record.detail)) {
    const first = record.detail[0];
    if (first && typeof first === 'object' && typeof (first as Record<string, unknown>).msg === 'string') {
      return (first as Record<string, string>).msg;
    }
  }

  return undefined;
};

const extractCourseRecord = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.success !== true || !record.course) {
    return null;
  }

  return normalizeCourse(record.course);
};

const extractCourseList = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (record.success !== true || !Array.isArray(record.courses)) {
    return [];
  }

  return record.courses.map(normalizeCourse).filter((course): course is Course => course !== null);
};

export const fetchPublicCourses = async () => {
  const response = await fetch(`${COURSE_API_BASE_URL}/api/courses`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to fetch courses.');
  }

  return extractCourseList(payload);
};

export const fetchAdminCourses = async () => {
  const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/courses`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to fetch admin courses.');
  }

  return extractCourseList(payload);
};

export const fetchAdminPerformance = async () => {
  const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/performance`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to fetch performance analytics.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected response from performance analytics service.');
  }

  const record = payload as Record<string, unknown>;
  const performance = normalizeAdminPerformanceMetrics(record.performance);
  if (record.success !== true || !performance) {
    throw new Error('Unexpected response from performance analytics service.');
  }

  return performance;
};

export const fetchPublicCourse = async (courseId: string, studentId?: string) => {
  const query = studentId ? `?student_id=${encodeURIComponent(studentId)}` : '';
  const response = await fetch(`${COURSE_API_BASE_URL}/api/courses/${encodeURIComponent(courseId)}${query}`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to fetch course.');
  }

  const course = extractCourseRecord(payload);
  if (!course) {
    throw new Error('Unexpected response from course service.');
  }

  return course;
};

export const enrollInCourse = async (courseId: string, studentId: string) => {
  const response = await fetch(`${COURSE_API_BASE_URL}/api/courses/${encodeURIComponent(courseId)}/enroll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ studentId }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to enroll in course.');
  }

  const course = extractCourseRecord(payload);
  if (!course) {
    throw new Error('Unexpected response from enrollment service.');
  }

  return {
    course,
    message: extractApiMessage(payload),
  };
};

export const submitCourseRating = async (
  courseId: string,
  studentId: string,
  rating: number,
) => {
  const response = await fetch(`${COURSE_API_BASE_URL}/api/courses/${encodeURIComponent(courseId)}/rating`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ studentId, rating }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to save course rating.');
  }

  const course = extractCourseRecord(payload);
  if (!course) {
    throw new Error('Unexpected response from course rating service.');
  }

  return {
    course,
    message: extractApiMessage(payload),
  };
};

export const fetchStudentLearningCourses = async (studentId: string) => {
  const response = await fetch(`${COURSE_API_BASE_URL}/api/students/${encodeURIComponent(studentId)}/learning-courses`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to fetch learning courses.');
  }

  return extractCourseList(payload);
};

export const fetchAdminEnrollmentRequests = async (courseId?: string) => {
  const query = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';
  const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/enrollment-requests${query}`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to fetch enrollment requests.');
  }

  if (!payload || typeof payload !== 'object') {
    return [] as EnrollmentRequest[];
  }

  const record = payload as Record<string, unknown>;
  if (record.success !== true || !Array.isArray(record.requests)) {
    return [] as EnrollmentRequest[];
  }

  return record.requests
    .map(normalizeEnrollmentRequest)
    .filter((request): request is EnrollmentRequest => request !== null);
};

export const fetchAdminStudentEnrollments = async (courseId?: string) => {
  const query = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';
  const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/student-enrollments${query}`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to fetch enrolled students.');
  }

  if (!payload || typeof payload !== 'object') {
    return [] as AdminStudentEnrollment[];
  }

  const record = payload as Record<string, unknown>;
  if (record.success !== true || !Array.isArray(record.enrollments)) {
    return [] as AdminStudentEnrollment[];
  }

  return record.enrollments
    .map(normalizeAdminStudentEnrollment)
    .filter((enrollment): enrollment is AdminStudentEnrollment => enrollment !== null);
};

export const removeAdminStudentEnrollment = async (enrollmentId: string) => {
  const response = await fetch(
    `${COURSE_API_BASE_URL}/api/admin/student-enrollments/${encodeURIComponent(enrollmentId)}`,
    { method: 'DELETE' },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to remove student from the course.');
  }

  return extractApiMessage(payload) ?? 'Student removed from the course.';
};

export const updateAdminEnrollmentRequest = async (
  requestId: string,
  status: EnrollmentRequestStatus,
) => {
  const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/enrollment-requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to update enrollment request.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected response from enrollment request service.');
  }

  const record = payload as Record<string, unknown>;
  const request = normalizeEnrollmentRequest(record.request);
  if (record.success !== true || !request) {
    throw new Error('Unexpected response from enrollment request service.');
  }

  return request;
};

export const completeLectureProgress = async (
  courseId: string,
  lectureId: string,
  studentId: string,
) => {
  const response = await fetch(
    `${COURSE_API_BASE_URL}/api/courses/${encodeURIComponent(courseId)}/lectures/${encodeURIComponent(lectureId)}/complete`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ studentId }),
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to update lecture progress.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected response from lecture progress service.');
  }

  const record = payload as Record<string, unknown>;
  const progress = normalizeLectureProgress(record.progress);
  if (record.success !== true || !progress) {
    throw new Error('Unexpected response from lecture progress service.');
  }

  return {
    progress,
    message: extractApiMessage(payload),
  };
};

export const fetchLectureQuiz = async (
  courseId: string,
  lectureId: string,
  studentId: string,
) => {
  const response = await fetch(
    `${COURSE_API_BASE_URL}/api/courses/${encodeURIComponent(courseId)}/lectures/${encodeURIComponent(lectureId)}/quiz?student_id=${encodeURIComponent(studentId)}`,
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to fetch quiz.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected response from quiz service.');
  }

  const record = payload as Record<string, unknown>;
  const quiz = normalizeLectureQuiz(record.quiz);
  if (record.success !== true || !quiz) {
    throw new Error('Unexpected response from quiz service.');
  }

  return quiz;
};

export const submitLectureQuizAttempt = async (
  courseId: string,
  lectureId: string,
  studentId: string,
  selections: Array<{ questionId: string; answerId: string }>,
) => {
  const response = await fetch(
    `${COURSE_API_BASE_URL}/api/courses/${encodeURIComponent(courseId)}/lectures/${encodeURIComponent(lectureId)}/quiz/attempt`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId,
        selections,
      }),
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractApiMessage(payload) ?? 'Unable to submit quiz.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected response from quiz attempt service.');
  }

  const record = payload as Record<string, unknown>;
  const attempt = normalizeQuizAttempt(record.attempt);
  if (record.success !== true || !attempt) {
    throw new Error('Unexpected response from quiz attempt service.');
  }

  return {
    attempt,
    message: extractApiMessage(payload),
  };
};
