import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, ChevronLeft, CheckCircle2, Circle, Menu, X, Share2, MoreVertical, FileText, HelpCircle, Video, Star, ExternalLink, Download } from 'lucide-react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils';
import { UserAvatar } from '../../components/UserAvatar';
import type { Course, Lecture, LectureQuiz, QuizAttempt, Section } from '../../types';
import { completeLectureProgress, fetchLectureQuiz, fetchPublicCourse, submitCourseRating, submitLectureQuizAttempt } from '../../lib/courseApi';
import { useAuth } from '../../auth/AuthContext';

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const RESOURCE_CONTENT_PREFIX = '__RESOURCE_JSON__';

type ResourceFileItem = {
  id: string;
  title: string;
  fileName: string;
  size?: string;
  mimeType?: string;
  url: string;
};

const extractYoutubeVideoId = (input: string): string | null => {
  const value = input.trim();
  if (!value) {
    return null;
  }

  if (YOUTUBE_ID_REGEX.test(value)) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (hostname === 'youtu.be') {
      const candidate = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
      return YOUTUBE_ID_REGEX.test(candidate) ? candidate : null;
    }

    if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'youtube-nocookie.com') {
      const fromQuery = parsed.searchParams.get('v') ?? '';
      if (YOUTUBE_ID_REGEX.test(fromQuery)) {
        return fromQuery;
      }

      const segments = parsed.pathname.split('/').filter(Boolean);
      const specialIndex = segments.findIndex((segment) => ['embed', 'shorts', 'live'].includes(segment));
      if (specialIndex >= 0 && segments[specialIndex + 1] && YOUTUBE_ID_REGEX.test(segments[specialIndex + 1])) {
        return segments[specialIndex + 1];
      }
    }
  } catch {
    // Keep fallback regex handling below.
  }

  const matched = value.match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return matched ? matched[1] : null;
};

const buildYoutubeEmbedUrl = (input: string): string | null => {
  const videoId = extractYoutubeVideoId(input);
  if (!videoId) {
    return null;
  }

  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
};

const parseResourceFiles = (rawContent?: string): ResourceFileItem[] => {
  const trimmed = rawContent?.trim() ?? '';
  if (!trimmed || !trimmed.startsWith(RESOURCE_CONTENT_PREFIX)) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed.slice(RESOURCE_CONTENT_PREFIX.length)) as { items?: unknown[] };
    if (!Array.isArray(parsed.items)) {
      return [];
    }

    return parsed.items.reduce<ResourceFileItem[]>((resources, item, index) => {
      if (!item || typeof item !== 'object') {
        return resources;
      }

      const record = item as Record<string, unknown>;
      const kind = typeof record.kind === 'string' ? record.kind : '';
      if (kind !== 'file') {
        return resources;
      }

      const fileData = typeof record.fileData === 'string' ? record.fileData.trim() : '';
      const fileUrl = typeof record.url === 'string' ? record.url.trim() : '';
      const downloadableUrl = fileData || fileUrl;
      if (!downloadableUrl) {
        return resources;
      }

      const fileName = typeof record.fileName === 'string' && record.fileName.trim()
        ? record.fileName.trim()
        : typeof record.title === 'string' && record.title.trim()
          ? record.title.trim()
          : `Resource-${index + 1}`;

      resources.push({
        id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `resource-${index + 1}`,
        title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : fileName,
        fileName,
        size: typeof record.size === 'string' && record.size.trim() ? record.size.trim() : undefined,
        mimeType: typeof record.mimeType === 'string' && record.mimeType.trim() ? record.mimeType.trim() : undefined,
        url: downloadableUrl,
      });

      return resources;
    }, []);
  } catch {
    return [];
  }
};

const SECTION_TITLE_DELIMITER = '::';

const parseSectionTitle = (title: string) => {
  const parts = title.split(SECTION_TITLE_DELIMITER).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      sectionTitle: parts[0],
      subsectionTitle: parts.slice(1).join(` ${SECTION_TITLE_DELIMITER} `).trim(),
    };
  }

  return {
    sectionTitle: title.trim(),
    subsectionTitle: title.trim(),
  };
};

const normalizeTitle = (value: string) => value.trim().toLowerCase();

const getSectionGroupTitle = (title: string) => {
  const parsed = parseSectionTitle(title);
  return parsed.sectionTitle || title.trim();
};

const filterSectionsBySubsection = (sections: Section[], subsectionId: string | null) => {
  if (!subsectionId) {
    return sections;
  }
  const filtered = sections.filter((section) => section.id === subsectionId);
  return filtered.length > 0 ? filtered : sections;
};

const filterSectionsByGroup = (sections: Section[], filter: string | null) => {
  if (!filter) {
    return sections;
  }
  const normalized = normalizeTitle(filter);
  const filtered = sections.filter((section) =>
    normalizeTitle(getSectionGroupTitle(section.title)) === normalized,
  );
  return filtered.length > 0 ? filtered : sections;
};

const findLectureById = (sections: Section[], lectureId?: string) => {
  if (!lectureId) {
    return null;
  }

  for (const section of sections) {
    const lecture = section.lectures.find((candidate) => candidate.id === lectureId);
    if (lecture) {
      return { lecture, sectionId: section.id };
    }
  }

  return null;
};

export const CoursePlayer = () => {
  const { id, lectureId } = useParams();
  const [searchParams] = useSearchParams();
  const sectionFilter = (searchParams.get('section') ?? '').trim() || null;
  const subsectionFilter = (searchParams.get('subsection') ?? '').trim() || null;
  const { user } = useAuth();
  const mainContentRef = useRef<HTMLElement | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeLecture, setActiveLecture] = useState<Lecture | undefined>(undefined);
  const [activeLectureQuiz, setActiveLectureQuiz] = useState<LectureQuiz | null>(null);
  const [quizAttempt, setQuizAttempt] = useState<QuizAttempt | null>(null);
  const [quizReviewAttempt, setQuizReviewAttempt] = useState<QuizAttempt | null>(null);
  const [quizSelections, setQuizSelections] = useState<Record<string, string>>({});
  const [isRetakingQuiz, setIsRetakingQuiz] = useState(false);
  const [isReviewingQuiz, setIsReviewingQuiz] = useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizMessage, setQuizMessage] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingMessage, setRatingMessage] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const courseSections = course?.sections ?? [];

  const visibleSections = useMemo(() => {
    const baseSections = filterSectionsBySubsection(courseSections, subsectionFilter);
    return subsectionFilter ? baseSections : filterSectionsByGroup(baseSections, sectionFilter);
  }, [courseSections, sectionFilter, subsectionFilter]);

  useEffect(() => {
    if (!id) {
      setCourse(null);
      setActiveLecture(undefined);
      setIsLoading(false);
      return;
    }

    const loadCourse = async () => {
      try {
        const fetchedCourse = await fetchPublicCourse(
          id,
          user?.role === 'Student' ? user.id : undefined,
        );
        setCourse(fetchedCourse);
        const baseSections = filterSectionsBySubsection(fetchedCourse.sections, subsectionFilter);
        const filteredSections = subsectionFilter ? baseSections : filterSectionsByGroup(baseSections, sectionFilter);
        const foundLecture = findLectureById(filteredSections, lectureId);
        setActiveLecture(foundLecture?.lecture ?? filteredSections[0]?.lectures[0]);
      } catch {
        setCourse(null);
        setActiveLecture(undefined);
      } finally {
        setIsLoading(false);
      }
    };

    loadCourse();
  }, [id, lectureId, sectionFilter, subsectionFilter, user]);

  useEffect(() => {
    if (!id || !activeLecture || activeLecture.type !== 'Quiz' || user?.role !== 'Student' || !user.id) {
      setActiveLectureQuiz(null);
      setQuizAttempt(null);
      setQuizReviewAttempt(null);
      setQuizSelections({});
      setIsRetakingQuiz(false);
      setIsReviewingQuiz(false);
      setIsSubmitConfirmOpen(false);
      setQuizError(null);
      setQuizMessage(null);
      setIsQuizLoading(false);
      return;
    }

    let isCancelled = false;
    setIsQuizLoading(true);
    setQuizError(null);
    setQuizMessage(null);

    fetchLectureQuiz(id, activeLecture.id, user.id)
      .then((quiz) => {
        if (isCancelled) {
          return;
        }

        setActiveLectureQuiz(quiz);
        const latestAttempt = quiz.latestAttempt ?? quiz.attempts?.[0] ?? null;
        setQuizAttempt(latestAttempt);
        setQuizReviewAttempt(latestAttempt);
        setIsRetakingQuiz(false);
        setIsReviewingQuiz(false);
        setIsSubmitConfirmOpen(false);
        const seededSelections: Record<string, string> = {};
        (latestAttempt?.results ?? []).forEach((result) => {
          if (result.selectedAnswerId) {
            seededSelections[result.questionId] = result.selectedAnswerId;
          }
        });
        setQuizSelections(seededSelections);
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        setActiveLectureQuiz(null);
        setQuizAttempt(null);
        setQuizReviewAttempt(null);
        setQuizSelections({});
        setIsRetakingQuiz(false);
        setIsReviewingQuiz(false);
        setIsSubmitConfirmOpen(false);
        setQuizError(error instanceof Error ? error.message : 'Unable to load quiz.');
      })
      .finally(() => {
        if (!isCancelled) {
          setIsQuizLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [activeLecture?.id, activeLecture?.type, id, user?.id, user?.role]);

  useEffect(() => {
    if (
      isLoading ||
      !id ||
      !activeLecture ||
      activeLecture.type === 'Quiz' ||
      user?.role !== 'Student' ||
      !user.id ||
      !course?.isEnrolled
    ) {
      return;
    }

    let isCancelled = false;
    completeLectureProgress(id, activeLecture.id, user.id)
      .then(({ progress }) => {
        if (isCancelled) {
          return;
        }

        setCourse((previous) => ({
          ...previous,
          progress: progress.courseProgress,
          learningStatus: progress.courseStatus,
          completedLectureIds: Array.from(new Set([...(previous.completedLectureIds ?? []), activeLecture.id])),
        }));
      })
      .catch(() => {
        // Keep player resilient when progress endpoint is temporarily unavailable.
      });

    return () => {
      isCancelled = true;
    };
  }, [activeLecture?.id, activeLecture?.type, course?.isEnrolled, id, isLoading, user?.id, user?.role]);

  useEffect(() => {
    if (!activeLecture?.id) {
      return;
    }

    mainContentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeLecture?.id]);

  useEffect(() => {
    setSelectedRating(course?.studentRating ?? 0);
  }, [course?.id, course?.studentRating]);

  useEffect(() => {
    if (visibleSections.length === 0) {
      setExpandedSections([]);
      return;
    }

    const matched = findLectureById(visibleSections, lectureId);
    const initialSectionId = matched?.sectionId ?? visibleSections[0].id;
    setExpandedSections([initialSectionId]);
  }, [course?.id, lectureId, visibleSections]);

  useEffect(() => {
    if (!lectureId || visibleSections.length === 0) {
      return;
    }

    const matched = findLectureById(visibleSections, lectureId);
    if (matched && matched.lecture.id !== activeLecture?.id) {
      setActiveLecture(matched.lecture);
    }
  }, [visibleSections, lectureId]);

  const activeVideoUrl = activeLecture?.videoUrl?.trim() ?? '';
  const isActiveLectureQuiz = activeLecture?.type === 'Quiz';
  const isActiveLectureResource = activeLecture?.type === 'Resource';
  const youtubeEmbedUrl = buildYoutubeEmbedUrl(activeVideoUrl);
  const hasDirectVideoUrl = Boolean(activeVideoUrl) && !youtubeEmbedUrl;
  const courseResourceFiles = useMemo(
    () =>
      visibleSections.flatMap((section) =>
        section.lectures.flatMap((lecture) =>
          parseResourceFiles(lecture.content).map((resourceFile, index) => ({
            ...resourceFile,
            id: `${lecture.id}-${resourceFile.id}-${index}`,
            lectureId: lecture.id,
            lectureTitle: lecture.title,
          })),
        ),
      ),
    [visibleSections],
  );
  const visibleLectures = useMemo(
    () => visibleSections.flatMap((section) => section.lectures),
    [visibleSections],
  );
  const completedLectureIdSet = new Set(course?.completedLectureIds ?? []);
  const progressValue = course?.progress;
  const normalizedProgress = typeof progressValue === 'number'
    ? Math.max(0, Math.min(100, Math.round(progressValue)))
    : null;
  const lastVisibleLectureId = visibleLectures.length > 0 ? visibleLectures[visibleLectures.length - 1].id : null;
  const isLastVisibleLecture = Boolean(activeLecture?.id && lastVisibleLectureId === activeLecture.id);
  const completedVisibleCount = visibleLectures.filter((lecture) => completedLectureIdSet.has(lecture.id)).length;
  const shouldShowFinishButton = isLastVisibleLecture;
  const totalLectureCount = courseSections.reduce((count, section) => count + section.lectures.length, 0);
  const completedLectureCount = Array.from(completedLectureIdSet).filter((lectureId) =>
    courseSections.some((section) => section.lectures.some((lecture) => lecture.id === lectureId)),
  ).length;
  const computedProgressPercent = totalLectureCount > 0
    ? Math.round((completedLectureCount / totalLectureCount) * 100)
    : normalizedProgress ?? 0;
  const displayedProgressPercent = completedLectureIdSet.size === 0 && normalizedProgress !== null
    ? normalizedProgress
    : computedProgressPercent;
  const answeredQuizCount = Object.keys(quizSelections).length;
  const canStartRetake = Boolean(quizAttempt) && !isRetakingQuiz;
  const quizAttempts = activeLectureQuiz?.attempts ?? (quizAttempt ? [quizAttempt] : []);
  const isCourseCompleted =
    course?.learningStatus === 'completed'
    || (totalLectureCount > 0 && completedLectureCount >= totalLectureCount);
  const studentRatingValue = course?.studentRating;
  const hasSubmittedRating = typeof studentRatingValue === 'number' && studentRatingValue >= 1 && studentRatingValue <= 5;
  const displayedRating = hasSubmittedRating ? (studentRatingValue ?? 0) : selectedRating;
  const answeredQuizItems = (activeLectureQuiz?.questions ?? [])
    .map((question, questionIndex) => {
      const selectedAnswerId = quizSelections[question.id];
      if (!selectedAnswerId) {
        return null;
      }

      const selectedAnswer = question.answers.find((answer) => answer.id === selectedAnswerId);
      if (!selectedAnswer) {
        return null;
      }

      return {
        questionNumber: questionIndex + 1,
        questionText: question.text,
        answerText: selectedAnswer.text,
      };
    })
    .filter((item): item is { questionNumber: number; questionText: string; answerText: string } => item !== null);
  const activeReviewAttempt = quizReviewAttempt ?? quizAttempt ?? quizAttempts[0] ?? null;

  const handleSelectQuizAnswer = (questionId: string, answerId: string) => {
    setQuizSelections((previous) => ({
      ...previous,
      [questionId]: answerId,
    }));
    setQuizMessage(null);
  };

  const handleStartRetakeQuiz = () => {
    setQuizAttempt(null);
    setQuizReviewAttempt(null);
    setQuizSelections({});
    setIsRetakingQuiz(true);
    setIsReviewingQuiz(false);
    setIsSubmitConfirmOpen(false);
    setQuizError(null);
    setQuizMessage('Retake started. Answer the quiz again, then submit.');
  };

  const handleRequestSubmitQuiz = () => {
    if (answeredQuizCount === 0 || isSubmittingQuiz || canStartRetake) {
      return;
    }

    setIsSubmitConfirmOpen(true);
    setQuizError(null);
    setQuizMessage(null);
  };

  const handleSubmitQuiz = async () => {
    if (!id || !activeLecture || activeLecture.type !== 'Quiz' || !user?.id || user.role !== 'Student' || !activeLectureQuiz) {
      return;
    }

    setIsSubmittingQuiz(true);
    setQuizError(null);
    setQuizMessage(null);

    try {
      const selections = Object.entries(quizSelections).map(([questionId, answerId]) => ({
        questionId,
        answerId,
      }));
      const { attempt, message } = await submitLectureQuizAttempt(id, activeLecture.id, user.id, selections);
      setActiveLectureQuiz((previous) => {
        if (!previous) {
          return previous;
        }

        const existingAttempts = previous.attempts ?? [];
        const dedupedAttempts = existingAttempts.filter((existingAttempt) => {
          if (attempt.attemptId && existingAttempt.attemptId) {
            return existingAttempt.attemptId !== attempt.attemptId;
          }

          return existingAttempt.submittedAt !== attempt.submittedAt;
        });

        return {
          ...previous,
          latestAttempt: attempt,
          attempts: [attempt, ...dedupedAttempts],
        };
      });
      setQuizAttempt(attempt);
      setQuizReviewAttempt(attempt);
      setIsRetakingQuiz(false);
      setIsReviewingQuiz(false);
      setIsSubmitConfirmOpen(false);
      if (typeof attempt.courseProgress === 'number') {
        setCourse((previous) => ({
          ...previous,
          progress: attempt.courseProgress,
          learningStatus: attempt.courseStatus ?? previous.learningStatus,
          completedLectureIds: Array.from(new Set([...(previous.completedLectureIds ?? []), activeLecture.id])),
        }));
      }
      setQuizMessage(message ?? 'Quiz submitted successfully.');
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : 'Unable to submit quiz.');
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  const handleConfirmSubmitQuiz = () => {
    if (isSubmittingQuiz || answeredQuizCount === 0) {
      return;
    }

    void handleSubmitQuiz();
  };

  const handleOpenReviewQuiz = (attemptToReview?: QuizAttempt) => {
    setQuizReviewAttempt(attemptToReview ?? activeReviewAttempt);
    setIsReviewingQuiz(true);
  };

  const handleSubmitCourseRating = async () => {
    if (!id || !user?.id || user.role !== 'Student') {
      return;
    }

    if (hasSubmittedRating) {
      setRatingError('You have already submitted a rating for this course.');
      setRatingMessage(null);
      return;
    }

    if (selectedRating < 1 || selectedRating > 5) {
      setRatingError('Choose a rating from 1 to 5 stars.');
      setRatingMessage(null);
      return;
    }

    setIsSubmittingRating(true);
    setRatingError(null);
    setRatingMessage(null);

    try {
      const { course: updatedCourse, message } = await submitCourseRating(id, user.id, selectedRating);
      setCourse(updatedCourse);
      setRatingMessage(message ?? 'Rating saved.');
    } catch (error) {
      setRatingError(error instanceof Error ? error.message : 'Unable to save rating.');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((current) =>
      current.includes(sectionId)
        ? current.filter((currentSectionId) => currentSectionId !== sectionId)
        : [...current, sectionId],
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        Loading course player...
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 text-white">
        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="mb-3 text-2xl font-bold">Course not found</h1>
          <p className="text-slate-300">This course is unavailable right now.</p>
          <Link
            to="/browse"
            className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Back to Browse
          </Link>
        </div>
      </div>
    );
  }

  if (user?.role === 'Student' && course && !course.isEnrolled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 text-white">
        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="mb-3 text-2xl font-bold">Course Access Locked</h1>
          <p className="text-slate-300">
            {course.hasPendingEnrollmentRequest
              ? 'Your enrollment request is pending admin approval.'
              : 'You do not have access to this course yet.'}
          </p>
          <Link
            to={`/course/${course.id}`}
            className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Back to Course Page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-900 text-white">
      <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-slate-900 px-4">
        <div className="flex items-center gap-4">
          <Link to={`/course/${course.id}/learn`} className="rounded-lg p-2 transition-colors hover:bg-white/10">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="hidden sm:block">
            <h1 className="max-w-xs truncate text-sm font-bold">{course.title}</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <div className="h-1 w-32 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-indigo-500" style={{ width: `${displayedProgressPercent}%` }} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {displayedProgressPercent}% Complete
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="hidden items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all hover:bg-white/10 sm:flex">
            <Share2 className="h-4 w-4" />
            Share Course
          </button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="rounded-lg p-2 transition-colors hover:bg-white/10">
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main ref={mainContentRef} className="flex flex-1 flex-col overflow-y-auto">
          {!isActiveLectureQuiz && !isActiveLectureResource ? (
            <div className="group relative aspect-video bg-black">
              {youtubeEmbedUrl ? (
                <iframe
                  src={youtubeEmbedUrl}
                  title={activeLecture?.title ?? 'Lesson video'}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : hasDirectVideoUrl ? (
                <video src={activeVideoUrl} controls className="h-full w-full" />
              ) : (
                <>
                  <img src={course.image} alt="Video Placeholder" className="h-full w-full object-cover opacity-50" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600 shadow-2xl shadow-indigo-500/50 transition-all hover:scale-110 active:scale-95">
                      <Play className="ml-1 h-8 w-8 fill-current" />
                    </button>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button className="rounded-lg p-2 hover:bg-white/20"><Play className="h-5 w-5 fill-current" /></button>
                        <div className="text-xs font-bold">{activeLecture?.duration ?? '00:00'}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <button className="rounded border border-white/30 px-2 py-1 text-[10px] font-bold hover:bg-white/10">1.25x</button>
                        <button className="rounded-lg p-2 hover:bg-white/20"><MoreVertical className="h-5 w-5" /></button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {isActiveLectureQuiz || isActiveLectureResource ? (
            <div className="mx-auto w-full max-w-4xl space-y-8 p-8">

            {isCourseCompleted && user?.role === 'Student' ? (
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/20">
                    <Trophy className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-200">Course Finished</p>
                    <h3 className="mt-1 text-2xl font-bold text-emerald-100">You did well. The course is finished.</h3>
                    <p className="mt-2 whitespace-pre-line text-sm text-emerald-100/90">
                      {course.congratulationsMessage?.trim() || 'Excellent work finishing all sections. Keep building with what you learned.'}
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-white/10 bg-slate-950/30 p-4">
                  <h4 className="text-base font-bold text-white">Rate this course</h4>
                  <p className="mt-1 text-sm text-slate-300">
                    Your rating helps improve course quality for future students.
                  </p>

                  <div className="mt-4 flex items-center gap-2">
                    {Array.from({ length: 5 }, (_, starIndex) => {
                      const starValue = starIndex + 1;
                      const isFilled = starValue <= displayedRating;

                      return (
                        <button
                          key={starValue}
                          type="button"
                          disabled={isSubmittingRating || hasSubmittedRating}
                          onClick={() => {
                            setSelectedRating(starValue);
                            setRatingError(null);
                            setRatingMessage(null);
                          }}
                          className="rounded-lg p-1 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-70"
                          aria-label={`Rate ${starValue} star${starValue === 1 ? '' : 's'}`}
                        >
                          <Star
                            className={cn(
                              'h-7 w-7',
                              isFilled ? 'fill-amber-400 text-amber-400' : 'text-slate-500',
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSubmitCourseRating}
                      disabled={isSubmittingRating || hasSubmittedRating || selectedRating < 1}
                      className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSubmittingRating ? 'Saving...' : hasSubmittedRating ? 'Rating Submitted' : 'Save Rating'}
                    </button>
                    {typeof course.studentRating === 'number' ? (
                      <p className="text-sm text-slate-300">
                        Your current rating: <span className="font-semibold text-amber-300">{course.studentRating}/5</span>
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    Ratings are one-time submissions and cannot be changed after saving.
                  </p>

                  {ratingError ? <p className="mt-3 text-sm font-medium text-red-300">{ratingError}</p> : null}
                  {ratingMessage ? <p className="mt-3 text-sm font-medium text-emerald-300">{ratingMessage}</p> : null}
                </div>
              </motion.div>
            ) : null}

            <div className="space-y-6">
              <h2 className="text-3xl font-bold">{activeLecture?.title || 'Course Overview'}</h2>
              {isActiveLectureQuiz ? (
                <div className="space-y-5">
                  <div className="space-y-2 border-b border-white/10 pb-4">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Quiz Mode</p>
                    <h3 className="text-2xl font-bold text-white">{activeLecture?.title ?? 'Quiz'}</h3>
                    <p className="text-sm text-slate-300">
                      Answer all questions below, then submit to get your score.
                    </p>
                  </div>
                  {isQuizLoading ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                      Loading quiz questions...
                    </div>
                  ) : quizError ? (
                    <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-6 text-sm text-red-200">
                      {quizError}
                    </div>
                  ) : user?.role !== 'Student' ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                      Quiz attempts are available in student view only.
                    </div>
                  ) : !activeLectureQuiz ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                      Quiz data is not available for this lecture.
                    </div>
                  ) : (
                    <>
                      {quizAttempt ? (
                        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5">
                          <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Latest Attempt</p>
                          <p className="mt-2 text-2xl font-bold text-emerald-200">
                            {quizAttempt.score}/{quizAttempt.totalQuestions} ({quizAttempt.percentage}%)
                          </p>
                          <p className="mt-1 text-xs text-emerald-100/80">
                            Submitted: {new Date(quizAttempt.submittedAt).toLocaleString()}
                          </p>
                        </div>
                      ) : null}

                      {!quizAttempt || isRetakingQuiz ? (
                        <>
                          {activeLectureQuiz.questions.map((question, questionIndex) => (
                            <div key={question.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                Question {questionIndex + 1}
                              </p>
                              <h3 className="mt-2 text-lg font-semibold text-white">{question.text}</h3>
                              <div className="mt-4 space-y-2">
                                {question.answers.map((answer) => {
                                  const isSelected = quizSelections[question.id] === answer.id;

                                  return (
                                    <button
                                      key={answer.id}
                                      type="button"
                                      onClick={() => handleSelectQuizAnswer(question.id, answer.id)}
                                      disabled={isSubmittingQuiz}
                                      className={cn(
                                        'w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                                        isSelected ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100' : 'border-white/15 bg-white/0 text-slate-200 hover:bg-white/10',
                                        isSubmittingQuiz ? 'cursor-not-allowed opacity-80' : '',
                                      )}
                                    >
                                      {answer.text}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}

                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-sm text-slate-400">
                              {answeredQuizCount}/{activeLectureQuiz.questions.length} answered
                            </p>
                            <button
                              type="button"
                              onClick={canStartRetake ? handleStartRetakeQuiz : handleRequestSubmitQuiz}
                              disabled={isSubmittingQuiz || (!canStartRetake && answeredQuizCount === 0)}
                              className="ml-auto rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isSubmittingQuiz ? 'Submitting...' : canStartRetake ? 'Retake Quiz' : 'Submit Quiz'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
                            <p className="text-sm text-slate-300">
                              Quiz submitted. Only your latest score is shown.
                            </p>
                            <button
                              type="button"
                              onClick={() => handleOpenReviewQuiz()}
                              disabled={isSubmittingQuiz || !activeReviewAttempt}
                              className="ml-auto rounded-xl border border-white/20 px-5 py-2.5 text-sm font-bold text-slate-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              Review Quiz
                            </button>
                            <button
                              type="button"
                              onClick={handleStartRetakeQuiz}
                              disabled={isSubmittingQuiz}
                              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              Retake Quiz
                            </button>
                          </div>

                          {quizAttempts.length > 0 ? (
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                Attempt History ({quizAttempts.length})
                              </p>
                              <div className="mt-3 space-y-2">
                                {quizAttempts.map((attempt, attemptIndex) => (
                                  <div
                                    key={attempt.attemptId ?? `${attempt.submittedAt}-${attemptIndex}`}
                                    className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-semibold text-slate-100">
                                        Attempt {attemptIndex + 1}
                                      </p>
                                      <p className="text-xs text-slate-400">
                                        {new Date(attempt.submittedAt).toLocaleString()}
                                      </p>
                                    </div>
                                    <p className="text-sm font-semibold text-emerald-300">
                                      {attempt.score}/{attempt.totalQuestions} ({attempt.percentage}%)
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenReviewQuiz(attempt)}
                                      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-white/10"
                                    >
                                      Review Quiz
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {isReviewingQuiz && activeReviewAttempt ? (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3">
                                <p className="text-sm font-semibold text-indigo-100">
                                  Reviewing attempt submitted {new Date(activeReviewAttempt.submittedAt).toLocaleString()}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setIsReviewingQuiz(false)}
                                  className="ml-auto rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-white/10"
                                >
                                  Hide Review
                                </button>
                              </div>

                              {activeLectureQuiz.questions.map((question, questionIndex) => {
                                const questionResult = activeReviewAttempt.results.find(
                                  (result) => result.questionId === question.id,
                                );

                                return (
                                  <div key={question.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                      Question {questionIndex + 1}
                                    </p>
                                    <h3 className="mt-2 text-lg font-semibold text-white">{question.text}</h3>
                                    <div className="mt-4 space-y-2">
                                      {question.answers.map((answer) => {
                                        const isSelected = questionResult?.selectedAnswerId === answer.id;
                                        const isCorrectAnswer = questionResult?.correctAnswerId === answer.id;
                                        const isWrongSelected = Boolean(isSelected && questionResult && !questionResult.isCorrect);

                                        return (
                                          <div
                                            key={answer.id}
                                            className={cn(
                                              'w-full rounded-xl border px-4 py-3 text-sm',
                                              isSelected ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100' : 'border-white/15 bg-white/0 text-slate-200',
                                              isCorrectAnswer ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100' : '',
                                              isWrongSelected ? 'border-red-400/60 bg-red-500/20 text-red-100' : '',
                                            )}
                                          >
                                            <div className="flex items-center justify-between gap-3">
                                              <span>{answer.text}</span>
                                              <span className="text-[11px] font-semibold uppercase tracking-wider">
                                                {isCorrectAnswer ? 'Correct' : isSelected ? 'Your answer' : ''}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {questionResult ? (
                                      <p className={cn(
                                        'mt-3 text-xs font-medium',
                                        questionResult.isCorrect ? 'text-emerald-300' : 'text-red-300',
                                      )}>
                                        {questionResult.isCorrect ? 'Correct' : `Incorrect. Correct answer: ${questionResult.correctAnswerText}`}
                                        {questionResult.explanation ? ` - ${questionResult.explanation}` : ''}
                                      </p>
                                    ) : (
                                      <p className="mt-3 text-xs font-medium text-slate-400">No answer submitted for this question.</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      )}
                      {quizMessage ? (
                        <p className="text-sm font-medium text-emerald-300">{quizMessage}</p>
                      ) : null}
                      {isSubmitConfirmOpen ? (
                        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-4">
                          <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
                            <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Confirm Submission</p>
                            <h4 className="mt-2 text-xl font-bold text-white">Are you sure you want to submit?</h4>
                            <p className="mt-2 text-sm text-slate-300">
                              Review your answered items below before final submission.
                            </p>
                            <div className="mt-4 max-h-64 space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40 p-4">
                              {answeredQuizItems.length > 0 ? (
                                answeredQuizItems.map((item) => (
                                  <div key={`${item.questionNumber}-${item.questionText}`} className="rounded-lg border border-white/10 bg-white/5 p-3">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                      Question {item.questionNumber}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-100">{item.questionText}</p>
                                    <p className="mt-2 text-xs text-indigo-200">
                                      Selected: <span className="font-semibold text-indigo-100">{item.answerText}</span>
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <p className="text-sm text-slate-400">No answers selected yet.</p>
                              )}
                            </div>
                            <div className="mt-5 flex justify-end gap-3">
                              <button
                                type="button"
                                onClick={() => setIsSubmitConfirmOpen(false)}
                                disabled={isSubmittingQuiz}
                                className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleConfirmSubmitQuiz}
                                disabled={isSubmittingQuiz || answeredQuizItems.length === 0}
                                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                {isSubmittingQuiz ? 'Submitting...' : 'Confirm Submit'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : isActiveLectureResource ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Course Resources</p>
                    <h3 className="mt-2 text-2xl font-bold text-white">Downloadable Files</h3>
                    <p className="mt-1 text-sm text-slate-300">
                      View or download the resource files uploaded for this course.
                    </p>
                  </div>

                  {courseResourceFiles.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                      No files are available for this course yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {courseResourceFiles.map((resourceFile, resourceIndex) => (
                        <div
                          key={resourceFile.id}
                          className="rounded-2xl border border-white/10 bg-white/5 p-4"
                        >
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20">
                              <FileText className="h-5 w-5 text-indigo-300" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">
                                {resourceFile.title || resourceFile.fileName || `Resource ${resourceIndex + 1}`}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                From lesson: {resourceFile.lectureTitle}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {resourceFile.fileName}
                                {resourceFile.size ? ` • ${resourceFile.size}` : ''}
                                {resourceFile.mimeType ? ` • ${resourceFile.mimeType}` : ''}
                              </p>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                              <a
                                href={resourceFile.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-white/10"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                View
                              </a>
                              <a
                                href={resourceFile.url}
                                download={resourceFile.fileName}
                                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <p className="leading-relaxed text-slate-400">
                    {activeLecture?.content?.trim() || course.description || 'Select a lecture to start learning.'}
                  </p>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20">
                        <FileText className="h-5 w-5 text-indigo-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold">Course Materials</h4>
                        <p className="mt-1 text-xs text-slate-500">Lecture notes, resources, and lesson content are available as you progress.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
                        <Trophy className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold">Certificate</h4>
                        <p className="mt-1 text-xs text-slate-500">Finish all lectures to unlock your verifiable certificate.</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-8">
                    <h3 className="mb-4 font-bold">Instructor</h3>
                    <div className="flex items-center gap-4">
                      <UserAvatar
                        name="Dr. Sarah Johnson"
                        className="h-12 w-12 border border-white/10 bg-white/10"
                        textClassName="text-sm"
                      />
                      <div>
                        <h4 className="font-bold">Dr. Sarah Johnson</h4>
                        <p className="text-xs text-slate-500">Full Stack Web Developer &amp; Lead Instructor</p>
                      </div>
                      <button className="ml-auto rounded-xl border border-white/20 px-4 py-2 text-xs font-bold transition-all hover:bg-white/10">Follow</button>
                    </div>
                  </div>
                </>
              )}

              {shouldShowFinishButton ? (
                <div className="flex justify-end">
                  <Link
                    to={`/course/${course.id}/learn`}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600"
                  >
                    Back to Course
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
          ) : null}

          {!isActiveLectureQuiz && !isActiveLectureResource && shouldShowFinishButton ? (
            <div className="mx-auto w-full max-w-4xl px-8 pb-10 pt-6">
              <div className="flex justify-end">
                <Link
                  to={`/course/${course.id}/learn`}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600"
                >
                  Back to Course
                </Link>
              </div>
            </div>
          ) : null}
        </main>

        <AnimatePresence>
          {sidebarOpen ? (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex shrink-0 flex-col overflow-hidden border-l border-white/10 bg-slate-900"
            >
              <div className="border-b border-white/10 p-6">
                <h3 className="font-bold">Course Content</h3>
              </div>
              <div className="flex-1 overflow-y-auto">
                {visibleSections.map((section, sectionIndex) => {
                  const parsedTitle = parseSectionTitle(section.title);
                  const displayTitle = parsedTitle.subsectionTitle || section.title;
                  const sectionLabel = sectionFilter ? 'Subsection' : 'Section';

                  return (
                  <div key={section.id} className="border-b border-white/5">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      className="flex w-full items-center justify-between bg-white/5 p-4 text-left transition-colors hover:bg-white/10"
                    >
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          {sectionLabel} {sectionIndex + 1}: {displayTitle}
                        </h4>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {section.lectures.length} Lecture{section.lectures.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-slate-500 transition-transform',
                          expandedSections.includes(section.id) ? 'rotate-180' : '',
                        )}
                      />
                    </button>
                    {expandedSections.includes(section.id) ? (
                      <div className="divide-y divide-white/5">
                        {section.lectures.map((lecture, lectureIndex) => {
                          const isActive = activeLecture?.id === lecture.id;
                          const isCompleted = completedLectureIdSet.has(lecture.id);

                          return (
                            <button
                              key={lecture.id}
                              onClick={() => setActiveLecture(lecture)}
                              className={cn(
                                'flex w-full items-start gap-3 p-4 text-left transition-colors',
                                isActive ? 'border-l-4 border-indigo-500 bg-indigo-600/20' : 'hover:bg-white/5',
                              )}
                            >
                              <div className="mt-0.5">
                                {isCompleted ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                ) : (
                                  <Circle className="h-4 w-4 text-slate-600" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h5 className={cn('truncate text-sm font-medium', isActive ? 'text-indigo-400' : 'text-slate-300')}>
                                  {lectureIndex + 1}. {lecture.title}
                                </h5>
                                <div className="mt-1 flex items-center gap-2">
                                  {lecture.type === 'Video' ? (
                                    <Video className="h-3 w-3 text-slate-500" />
                                  ) : lecture.type === 'Quiz' ? (
                                    <HelpCircle className="h-3 w-3 text-slate-500" />
                                  ) : (
                                    <FileText className="h-3 w-3 text-slate-500" />
                                  )}
                                  <span className="text-[10px] text-slate-500">{lecture.duration || 'Read content'}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
                })}
              </div>
              <div className="border-t border-white/10 p-4">
                <Link
                  to={`/course/${course.id}/learn`}
                  className="flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 py-3 text-sm font-bold text-emerald-100 transition-all hover:bg-emerald-500/20"
                >
                  Back to Course
                </Link>
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};

const ChevronDown = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6" /></svg>
);

const Trophy = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
);
