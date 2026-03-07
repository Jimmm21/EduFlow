export type CourseLevel = 'Beginner' | 'Intermediate' | 'Expert' | 'All Levels';
export type CourseCategory = 'Development' | 'Business' | 'IT & Software' | 'Design' | 'Marketing' | 'Photography';
export type ContentType = 'Video' | 'Article' | 'Quiz' | 'Resource';
export type QuizQuestionType = 'Multiple Choice' | 'True / False';

export interface Lecture {
  id: string;
  title: string;
  type: ContentType;
  duration?: string;
  content?: string;
  videoUrl?: string;
  isCompleted?: boolean;
}

export interface Section {
  id: string;
  title: string;
  lectures: Lecture[];
}

export interface Course {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  language: string;
  level: CourseLevel;
  category: CourseCategory;
  image: string;
  promoVideo?: string;
  targetStudents: string[];
  sections: Section[];
  status: 'Draft' | 'Published';
  enrollmentStatus: 'Open' | 'Closed';
  visibility: 'Public' | 'Private';
  studentsCount: number;
  rating: number;
  lastUpdated: string;
  isEnrolled?: boolean;
  hasPendingEnrollmentRequest?: boolean;
  enrollmentRequestStatus?: EnrollmentRequestStatus;
  progress?: number;
  learningStatus?: LearningStatus;
  completedLectureIds?: string[];
  studentRating?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Student';
  avatar?: string;
}

export type LearningStatus = 'in-progress' | 'completed' | 'wishlist';
export type EnrollmentRequestStatus = 'Pending' | 'Accepted' | 'Rejected';

export interface StudentCourseProgress {
  courseId: string;
  progress: number;
  status: LearningStatus;
}

export interface EnrollmentRequest {
  id: string;
  courseId: string;
  courseTitle?: string;
  studentId?: string;
  studentName: string;
  studentEmail: string;
  requestedAt: string;
  status: EnrollmentRequestStatus;
  note?: string;
}

export interface CourseEnrollment {
  id: string;
  courseId: string;
  studentName: string;
  studentEmail: string;
  enrolledAt: string;
  progress: number;
}

export interface CourseReview {
  id: string;
  courseId: string;
  studentName: string;
  rating: number;
  comment: string;
  submittedAt: string;
}

export interface QuizAnswerOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  type: QuizQuestionType;
  answers: QuizAnswerOption[];
}

export interface QuizAttemptQuestionResult {
  questionId: string;
  selectedAnswerId?: string;
  selectedAnswerText?: string;
  correctAnswerId: string;
  correctAnswerText: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface QuizAttempt {
  attemptId?: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  submittedAt: string;
  results: QuizAttemptQuestionResult[];
  courseProgress?: number;
  completedSections?: number;
  totalSections?: number;
  completedLectures?: number;
  totalLectures?: number;
  courseStatus?: LearningStatus;
}

export interface LectureProgress {
  courseId: string;
  lectureId: string;
  lectureTitle: string;
  courseProgress: number;
  completedSections: number;
  totalSections: number;
  completedLectures: number;
  totalLectures: number;
  courseStatus: LearningStatus;
}

export interface LectureQuiz {
  courseId: string;
  sectionId: string;
  lectureId: string;
  lectureTitle: string;
  questions: QuizQuestion[];
  attempts?: QuizAttempt[];
  latestAttempt?: QuizAttempt;
}

export interface AdminTopStudentMetric {
  studentId: string;
  studentName: string;
  coursesCompleted: number;
  avgQuizScore: number;
  quizzesTaken: number;
}

export interface AdminPopularCourseMetric {
  courseId: string;
  title: string;
  category: string;
  enrollments: number;
  rating: number;
}

export interface AdminPerformanceMetrics {
  topStudents: AdminTopStudentMetric[];
  popularCourses: AdminPopularCourseMetric[];
}
