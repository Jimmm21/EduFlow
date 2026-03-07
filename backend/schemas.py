from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterStudentInput(BaseModel):
  name: str = Field(min_length=1, max_length=120)
  email: EmailStr
  password: str = Field(min_length=8, max_length=128)


class CreateAccountResponse(BaseModel):
  success: bool
  user: dict[str, Any] | None = None
  message: str | None = None


class LoginInput(BaseModel):
  email: EmailStr
  password: str = Field(min_length=1, max_length=128)


class LoginResponse(BaseModel):
  success: bool
  user: dict[str, Any] | None = None
  message: str | None = None


class LectureInput(BaseModel):
  id: str | None = None
  title: str = Field(min_length=1, max_length=200)
  type: Literal["Video", "Article", "Quiz", "Resource"]
  duration: str | None = Field(default=None, max_length=20)
  content: str | None = None
  videoUrl: str | None = None


class SectionInput(BaseModel):
  id: str | None = None
  title: str = Field(min_length=1, max_length=200)
  lectures: list[LectureInput] = Field(default_factory=list)


class CreateCourseInput(BaseModel):
  title: str = Field(min_length=1, max_length=120)
  subtitle: str = Field(default="", max_length=200)
  description: str = Field(default="")
  language: str = Field(default="English", max_length=100)
  level: Literal["Beginner", "Intermediate", "Expert", "All Levels"] = "Beginner"
  category: Literal["Development", "Business", "IT & Software", "Design", "Marketing", "Photography"] = "Development"
  image: str = Field(default="")
  promoVideo: str | None = None
  targetStudents: list[str] = Field(default_factory=list)
  status: Literal["Draft", "Published"] = "Draft"
  enrollmentStatus: Literal["Open", "Closed"] = "Open"
  visibility: Literal["Public", "Private"] = "Public"
  sections: list[SectionInput] = Field(default_factory=list)


class CourseResponse(BaseModel):
  success: bool
  course: dict[str, Any] | None = None
  courses: list[dict[str, Any]] | None = None
  message: str | None = None


class AdminTopStudentMetric(BaseModel):
  studentId: str = Field(min_length=1, max_length=64)
  studentName: str = Field(min_length=1, max_length=120)
  coursesCompleted: int = Field(default=0, ge=0)
  avgQuizScore: float = Field(default=0, ge=0, le=100)
  quizzesTaken: int = Field(default=0, ge=0)


class AdminPopularCourseMetric(BaseModel):
  courseId: str = Field(min_length=1, max_length=200)
  title: str = Field(min_length=1, max_length=200)
  category: str = Field(min_length=1, max_length=100)
  enrollments: int = Field(default=0, ge=0)
  rating: float = Field(default=0, ge=0, le=5)


class AdminPerformancePayload(BaseModel):
  topStudents: list[AdminTopStudentMetric] = Field(default_factory=list)
  popularCourses: list[AdminPopularCourseMetric] = Field(default_factory=list)


class AdminPerformanceResponse(BaseModel):
  success: bool
  performance: AdminPerformancePayload | None = None
  message: str | None = None


class CourseEnrollmentInput(BaseModel):
  studentId: str = Field(min_length=1, max_length=64)


class CourseRatingInput(BaseModel):
  studentId: str = Field(min_length=1, max_length=64)
  rating: int = Field(ge=1, le=5)


class EnrollmentRequestActionInput(BaseModel):
  status: Literal["Pending", "Accepted", "Rejected"]


class EnrollmentRequestResponse(BaseModel):
  success: bool
  request: dict[str, Any] | None = None
  requests: list[dict[str, Any]] | None = None
  message: str | None = None


class UploadedAsset(BaseModel):
  url: str = Field(min_length=1)
  fileName: str = Field(min_length=1)


class AssetUploadResponse(BaseModel):
  success: bool
  asset: UploadedAsset | None = None
  message: str | None = None


class QuizAnswerOption(BaseModel):
  id: str = Field(min_length=1, max_length=128)
  text: str = Field(min_length=1)


class QuizQuestion(BaseModel):
  id: str = Field(min_length=1, max_length=128)
  text: str = Field(min_length=1)
  type: Literal["Multiple Choice", "True / False"] = "Multiple Choice"
  answers: list[QuizAnswerOption] = Field(default_factory=list)


class QuizAttemptQuestionResult(BaseModel):
  questionId: str = Field(min_length=1, max_length=128)
  selectedAnswerId: str | None = Field(default=None, max_length=128)
  selectedAnswerText: str | None = None
  correctAnswerId: str = Field(min_length=1, max_length=128)
  correctAnswerText: str = Field(min_length=1)
  isCorrect: bool
  explanation: str = Field(default="")


class QuizAttempt(BaseModel):
  attemptId: str | None = None
  score: int = Field(ge=0)
  totalQuestions: int = Field(ge=0)
  percentage: int = Field(ge=0, le=100)
  submittedAt: str = Field(min_length=1)
  results: list[QuizAttemptQuestionResult] = Field(default_factory=list)
  courseProgress: int | None = Field(default=None, ge=0, le=100)
  completedSections: int | None = Field(default=None, ge=0)
  totalSections: int | None = Field(default=None, ge=0)
  completedLectures: int | None = Field(default=None, ge=0)
  totalLectures: int | None = Field(default=None, ge=0)
  courseStatus: Literal["in-progress", "completed", "wishlist"] | None = None


class QuizLecturePayload(BaseModel):
  courseId: str = Field(min_length=1, max_length=200)
  sectionId: str = Field(min_length=1, max_length=200)
  lectureId: str = Field(min_length=1, max_length=200)
  lectureTitle: str = Field(min_length=1, max_length=200)
  questions: list[QuizQuestion] = Field(default_factory=list)
  attempts: list[QuizAttempt] = Field(default_factory=list)
  latestAttempt: QuizAttempt | None = None


class QuizLectureResponse(BaseModel):
  success: bool
  quiz: QuizLecturePayload | None = None
  message: str | None = None


class QuizAnswerSelectionInput(BaseModel):
  questionId: str = Field(min_length=1, max_length=128)
  answerId: str = Field(min_length=1, max_length=128)


class SubmitQuizAttemptInput(BaseModel):
  studentId: str = Field(min_length=1, max_length=64)
  selections: list[QuizAnswerSelectionInput] = Field(default_factory=list)


class QuizAttemptResponse(BaseModel):
  success: bool
  attempt: QuizAttempt | None = None
  message: str | None = None


class LectureProgressPayload(BaseModel):
  courseId: str = Field(min_length=1, max_length=200)
  lectureId: str = Field(min_length=1, max_length=200)
  lectureTitle: str = Field(min_length=1, max_length=200)
  courseProgress: int = Field(ge=0, le=100)
  completedSections: int = Field(ge=0)
  totalSections: int = Field(ge=0)
  completedLectures: int = Field(ge=0)
  totalLectures: int = Field(ge=0)
  courseStatus: Literal["in-progress", "completed", "wishlist"]


class LectureProgressResponse(BaseModel):
  success: bool
  progress: LectureProgressPayload | None = None
  message: str | None = None


class GenerateCourseCopyInput(BaseModel):
  title: str = Field(min_length=3, max_length=120)
  language: str = Field(default="English", max_length=100)
  level: Literal["Beginner", "Intermediate", "Expert", "All Levels"] = "Beginner"
  category: Literal["Development", "Business", "IT & Software", "Design", "Marketing", "Photography"] = "Development"


class GeneratedCourseCopy(BaseModel):
  description: str = Field(min_length=1)
  learningOutcomes: list[str] = Field(default_factory=list)


class GenerateCourseCopyResponse(BaseModel):
  success: bool
  content: GeneratedCourseCopy | None = None
  message: str | None = None


class GenerateQuizFromVideoInput(BaseModel):
  videoUrl: str = Field(min_length=1, max_length=1000)
  lessonTitle: str = Field(default="", max_length=200)
  questionCount: int = Field(default=5, ge=1, le=10)
  questionType: Literal["Multiple Choice", "True / False", "Mixed"] = "Multiple Choice"


class GeneratedQuizAnswer(BaseModel):
  text: str = Field(min_length=1)
  explanation: str = Field(default="")


class GeneratedQuizQuestion(BaseModel):
  text: str = Field(min_length=1)
  type: Literal["Multiple Choice", "True / False"] = "Multiple Choice"
  answers: list[GeneratedQuizAnswer] = Field(default_factory=list)
  correctAnswerIndex: int = Field(default=0, ge=0)


class GeneratedQuizPayload(BaseModel):
  sourceSummary: str = Field(default="")
  questions: list[GeneratedQuizQuestion] = Field(default_factory=list)


class GenerateQuizFromVideoResponse(BaseModel):
  success: bool
  quiz: GeneratedQuizPayload | None = None
  message: str | None = None
