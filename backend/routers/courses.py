from fastapi import APIRouter, File, Request, UploadFile, status

from ..schemas import (
  AdminPerformanceResponse,
  AssetUploadResponse,
  CourseEnrollmentInput,
  CourseRatingInput,
  EnrollmentRequestActionInput,
  EnrollmentRequestResponse,
  LectureProgressResponse,
  CourseResponse,
  CreateCourseInput,
  GenerateAutomatedMessagesInput,
  GenerateAutomatedMessagesResponse,
  GenerateCourseCopyInput,
  GenerateCourseCopyResponse,
  GenerateQuizFromVideoInput,
  GenerateQuizFromVideoResponse,
  QuizAttemptResponse,
  QuizLectureResponse,
  StudentEnrollmentResponse,
  SubmitQuizAttemptInput,
)
from ..services import ai_content_service, course_service, quiz_service, upload_service

router = APIRouter()


@router.post(
  "/api/admin/uploads/course-image",
  response_model=AssetUploadResponse,
  status_code=status.HTTP_201_CREATED,
)
async def upload_course_image(request: Request, file: UploadFile = File(...)) -> AssetUploadResponse:
  asset = await upload_service.save_course_image(file, str(request.base_url))
  return AssetUploadResponse(success=True, asset=asset)


@router.post(
  "/api/admin/uploads/promo-video",
  response_model=AssetUploadResponse,
  status_code=status.HTTP_201_CREATED,
)
async def upload_promo_video(request: Request, file: UploadFile = File(...)) -> AssetUploadResponse:
  asset = await upload_service.save_promo_video(file, str(request.base_url))
  return AssetUploadResponse(success=True, asset=asset)


@router.post(
  "/api/admin/uploads/lesson-video",
  response_model=AssetUploadResponse,
  status_code=status.HTTP_201_CREATED,
)
async def upload_lesson_video(request: Request, file: UploadFile = File(...)) -> AssetUploadResponse:
  asset = await upload_service.save_lesson_video(file, str(request.base_url))
  return AssetUploadResponse(success=True, asset=asset)


@router.post(
  "/api/admin/courses",
  response_model=CourseResponse,
  status_code=status.HTTP_201_CREATED,
)
def create_course(payload: CreateCourseInput) -> CourseResponse:
  return course_service.create_course(payload)


@router.post(
  "/api/admin/courses/generate-content",
  response_model=GenerateCourseCopyResponse,
  status_code=status.HTTP_200_OK,
)
def generate_course_content(payload: GenerateCourseCopyInput) -> GenerateCourseCopyResponse:
  return ai_content_service.generate_course_copy(payload)


@router.post(
  "/api/admin/courses/generate-automated-messages",
  response_model=GenerateAutomatedMessagesResponse,
  status_code=status.HTTP_200_OK,
)
def generate_automated_messages(payload: GenerateAutomatedMessagesInput) -> GenerateAutomatedMessagesResponse:
  return ai_content_service.generate_automated_messages(payload)


@router.post(
  "/api/admin/courses/generate-quiz-from-video",
  response_model=GenerateQuizFromVideoResponse,
  status_code=status.HTTP_200_OK,
)
def generate_quiz_from_video(payload: GenerateQuizFromVideoInput) -> GenerateQuizFromVideoResponse:
  return ai_content_service.generate_quiz_from_video(payload)


@router.get("/api/courses/{course_id}/lectures/{lecture_id}/quiz", response_model=QuizLectureResponse)
def get_lecture_quiz(course_id: str, lecture_id: str, student_id: str) -> QuizLectureResponse:
  quiz = quiz_service.get_lecture_quiz(course_id, lecture_id, student_id)
  return QuizLectureResponse(success=True, quiz=quiz)


@router.post("/api/courses/{course_id}/lectures/{lecture_id}/quiz/attempt", response_model=QuizAttemptResponse)
def submit_lecture_quiz_attempt(
  course_id: str,
  lecture_id: str,
  payload: SubmitQuizAttemptInput,
) -> QuizAttemptResponse:
  attempt = quiz_service.submit_lecture_quiz_attempt(
    course_id,
    lecture_id,
    payload.studentId,
    [(selection.questionId, selection.answerId) for selection in payload.selections],
  )
  return QuizAttemptResponse(success=True, attempt=attempt, message="Quiz submitted.")


@router.post("/api/courses/{course_id}/lectures/{lecture_id}/complete", response_model=LectureProgressResponse)
def complete_course_lecture(
  course_id: str,
  lecture_id: str,
  payload: CourseEnrollmentInput,
) -> LectureProgressResponse:
  progress = quiz_service.complete_lecture(course_id, lecture_id, payload.studentId)
  return LectureProgressResponse(success=True, progress=progress, message="Lecture progress updated.")


@router.get("/api/courses", response_model=CourseResponse)
def list_public_courses() -> CourseResponse:
  return course_service.list_public_courses()


@router.get("/api/courses/{course_id}", response_model=CourseResponse)
def get_public_course(course_id: str, student_id: str | None = None) -> CourseResponse:
  return course_service.get_public_course(course_id, student_id=student_id)


@router.post("/api/courses/{course_id}/enroll", response_model=CourseResponse)
def enroll_in_course(course_id: str, payload: CourseEnrollmentInput) -> CourseResponse:
  return course_service.enroll_in_course(course_id, payload.studentId)


@router.post("/api/courses/{course_id}/rating", response_model=CourseResponse)
def rate_course(course_id: str, payload: CourseRatingInput) -> CourseResponse:
  return course_service.submit_course_rating(course_id, payload.studentId, payload.rating)


@router.get("/api/students/{student_id}/learning-courses", response_model=CourseResponse)
def list_student_learning_courses(student_id: str) -> CourseResponse:
  return course_service.list_student_learning_courses(student_id)


@router.get("/api/admin/enrollment-requests", response_model=EnrollmentRequestResponse)
def list_enrollment_requests(course_id: str | None = None) -> EnrollmentRequestResponse:
  requests = course_service.list_enrollment_requests(course_id=course_id)
  return EnrollmentRequestResponse(success=True, requests=requests)


@router.get("/api/admin/student-enrollments", response_model=StudentEnrollmentResponse)
def list_student_enrollments(course_id: str | None = None) -> StudentEnrollmentResponse:
  enrollments = course_service.list_student_enrollments(course_id=course_id)
  return StudentEnrollmentResponse(success=True, enrollments=enrollments)


@router.delete("/api/admin/student-enrollments/{enrollment_id}", response_model=StudentEnrollmentResponse)
def remove_student_enrollment(enrollment_id: str) -> StudentEnrollmentResponse:
  removed = course_service.remove_student_enrollment(enrollment_id)
  return StudentEnrollmentResponse(
    success=True,
    message=f"Removed {removed['studentName']} from {removed['courseTitle']}.",
  )


@router.patch("/api/admin/enrollment-requests/{request_id}", response_model=EnrollmentRequestResponse)
def update_enrollment_request_status(
  request_id: str,
  payload: EnrollmentRequestActionInput,
) -> EnrollmentRequestResponse:
  updated_request = course_service.update_enrollment_request_status(request_id, payload.status)
  return EnrollmentRequestResponse(success=True, request=updated_request)


@router.get("/api/admin/courses/{course_id}", response_model=CourseResponse)
def get_course(course_id: str) -> CourseResponse:
  return course_service.get_course(course_id)


@router.get("/api/admin/courses", response_model=CourseResponse)
def list_courses() -> CourseResponse:
  return course_service.list_courses()


@router.get("/api/admin/performance", response_model=AdminPerformanceResponse)
def get_admin_performance() -> AdminPerformanceResponse:
  performance = course_service.get_admin_performance()
  return AdminPerformanceResponse(success=True, performance=performance)


@router.put("/api/admin/courses/{course_id}", response_model=CourseResponse)
def update_course(course_id: str, payload: CreateCourseInput) -> CourseResponse:
  return course_service.update_course(course_id, payload)


@router.delete("/api/admin/courses/{course_id}", response_model=CourseResponse)
def delete_course(course_id: str) -> CourseResponse:
  return course_service.delete_course(course_id)
