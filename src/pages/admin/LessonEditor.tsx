import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Upload,
  Video,
  FileText,
  Link2,
  Copy,
  Trash2,
  PlusCircle,
  X,
  CheckCircle2,
  Circle,
  Sparkles,
} from 'lucide-react';
import type { Lecture, Section } from '../../types';
import { findLectureInSections, getCourseSectionsDraft, saveCourseSectionsDraft } from '../../admin/courseDraftStore';
import { API_BASE_URL as COURSE_API_BASE_URL } from '../../lib/apiBase';

const QUIZ_CONTENT_PREFIX = '__QUIZ_JSON__';
const RESOURCE_CONTENT_PREFIX = '__RESOURCE_JSON__';
type QuizQuestionType = 'Multiple Choice' | 'True / False';
type QuizGenerationType = 'Multiple Choice' | 'True / False' | 'Mixed';

interface QuizAnswer {
  id: string;
  text: string;
  explanation?: string;
}

interface QuizQuestion {
  id: string;
  text: string;
  type: QuizQuestionType;
  answers: QuizAnswer[];
  correctAnswerId: string;
}

interface QuizContent {
  questions: QuizQuestion[];
}

type ResourceKind = 'file' | 'link';

interface ResourceItem {
  id: string;
  title: string;
  kind: ResourceKind;
  size?: string;
  url?: string;
  fileName?: string;
  mimeType?: string;
  fileData?: string;
}

interface ResourceContent {
  items: ResourceItem[];
}

interface GeneratedQuizAnswerPayload {
  text: string;
  explanation?: string;
}

interface GeneratedQuizQuestionPayload {
  text: string;
  type?: QuizQuestionType;
  answers: GeneratedQuizAnswerPayload[];
  correctAnswerIndex: number;
}

interface GeneratedQuizPayload {
  sourceSummary?: string;
  questions: GeneratedQuizQuestionPayload[];
}

const createId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

const createMultipleChoiceQuestion = (): QuizQuestion => {
  const answer1: QuizAnswer = {
    id: createId('a'),
    text: '',
    explanation: '',
  };
  const answer2: QuizAnswer = {
    id: createId('a'),
    text: '',
    explanation: '',
  };

  return {
    id: createId('q'),
    text: '',
    type: 'Multiple Choice',
    answers: [answer1, answer2],
    correctAnswerId: answer1.id,
  };
};

const createTrueFalseQuestion = (): QuizQuestion => {
  const trueOption: QuizAnswer = {
    id: createId('a'),
    text: 'True',
  };
  const falseOption: QuizAnswer = {
    id: createId('a'),
    text: 'False',
  };

  return {
    id: createId('q'),
    text: '',
    type: 'True / False',
    answers: [trueOption, falseOption],
    correctAnswerId: trueOption.id,
  };
};

const createDefaultQuizContent = (): QuizContent => ({
  questions: [createMultipleChoiceQuestion()],
});

const createDefaultResource = (): ResourceItem => ({
  id: createId('r'),
  title: '',
  kind: 'file',
  size: '',
  url: '',
});

const createDefaultResourceContent = (): ResourceContent => ({
  items: [],
});

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
};

const extractApiMessage = (payload: unknown): string | undefined => {
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
    const firstDetail = record.detail[0];
    if (firstDetail && typeof firstDetail === 'object') {
      const detailRecord = firstDetail as Record<string, unknown>;
      if (typeof detailRecord.msg === 'string') {
        return detailRecord.msg;
      }
    }
  }

  return undefined;
};

const formatDurationFromSeconds = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const readVideoDuration = (file: File): Promise<number | null> =>
  new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : NaN;
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(duration) && duration > 0 ? duration : null);
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };

    video.src = objectUrl;
  });

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

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

const normalizeYoutubeUrl = (input: string): string => {
  const videoId = extractYoutubeVideoId(input);
  if (!videoId) {
    return input.trim();
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
};

const parseLegacyQuizText = (rawContent: string): QuizContent => {
  const questionMarker = '## Question';
  const explanationMarker = '## Explanation';
  const questionStart = rawContent.indexOf(questionMarker);
  const explanationStart = rawContent.indexOf(explanationMarker);

  const questionText = questionStart !== -1
    ? rawContent
      .slice(questionStart + questionMarker.length, explanationStart === -1 ? undefined : explanationStart)
      .trim()
    : rawContent.trim();

  const explanationText = explanationStart !== -1
    ? rawContent.slice(explanationStart + explanationMarker.length).trim()
    : '';

  const question = createMultipleChoiceQuestion();
  question.text = questionText;
  question.answers[0].explanation = explanationText;

  return {
    questions: [question],
  };
};

const normalizeQuestion = (question: QuizQuestion): QuizQuestion => {
  if (question.type === 'True / False') {
    const trueOption: QuizAnswer = {
      id: question.answers[0]?.id ?? createId('a'),
      text: 'True',
    };
    const falseOption: QuizAnswer = {
      id: question.answers[1]?.id ?? createId('a'),
      text: 'False',
    };

    return {
      ...question,
      answers: [trueOption, falseOption],
      correctAnswerId: [trueOption.id, falseOption.id].includes(question.correctAnswerId)
        ? question.correctAnswerId
        : trueOption.id,
    };
  }

  const answers = question.answers.length >= 2
    ? question.answers
    : [...question.answers, ...createMultipleChoiceQuestion().answers].slice(0, 2);

  return {
    ...question,
    answers,
    correctAnswerId: answers.some((answer) => answer.id === question.correctAnswerId)
      ? question.correctAnswerId
      : answers[0].id,
  };
};

const parseQuizContent = (rawContent: string): QuizContent => {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return createDefaultQuizContent();
  }

  if (trimmed.startsWith(QUIZ_CONTENT_PREFIX)) {
    try {
      const parsed = JSON.parse(trimmed.slice(QUIZ_CONTENT_PREFIX.length)) as QuizContent;
      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        return createDefaultQuizContent();
      }

      return {
        questions: parsed.questions.map(normalizeQuestion),
      };
    } catch {
      return createDefaultQuizContent();
    }
  }

  return parseLegacyQuizText(rawContent);
};

const serializeQuizContent = (quiz: QuizContent) => `${QUIZ_CONTENT_PREFIX}${JSON.stringify(quiz)}`;

const parseResourcesContent = (rawContent: string): ResourceContent => {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return createDefaultResourceContent();
  }

  if (trimmed.startsWith(RESOURCE_CONTENT_PREFIX)) {
    try {
      const parsed = JSON.parse(trimmed.slice(RESOURCE_CONTENT_PREFIX.length)) as ResourceContent;
      if (!Array.isArray(parsed.items)) {
        return createDefaultResourceContent();
      }

      return {
        items: parsed.items.map((item) => ({
          id: item.id || createId('r'),
          title: item.title || '',
          kind: item.kind === 'link' ? 'link' : 'file',
          size: item.size || '',
          url: typeof item.url === 'string' ? item.url.trim() : '',
          fileName: item.fileName || '',
          mimeType: item.mimeType || '',
          fileData: typeof item.url === 'string' && item.url.trim() ? '' : item.fileData || '',
        })),
      };
    } catch {
      return createDefaultResourceContent();
    }
  }

  return {
    items: [
      {
        ...createDefaultResource(),
        title: trimmed,
      },
    ],
  };
};

const serializeResourcesContent = (resources: ResourceContent) =>
  `${RESOURCE_CONTENT_PREFIX}${JSON.stringify(resources)}`;

const parseGeneratedQuizPayload = (payload: unknown): GeneratedQuizPayload | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.success !== true) {
    return null;
  }

  const quiz = record.quiz;
  if (!quiz || typeof quiz !== 'object') {
    return null;
  }

  const quizRecord = quiz as Record<string, unknown>;
  if (!Array.isArray(quizRecord.questions)) {
    return null;
  }

  const questions: GeneratedQuizQuestionPayload[] = quizRecord.questions
    .map((item): GeneratedQuizQuestionPayload | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const question = item as Record<string, unknown>;
      const text = typeof question.text === 'string' ? question.text.trim() : '';
      if (!text || !Array.isArray(question.answers)) {
        return null;
      }

      const answers = question.answers
        .map((answer): GeneratedQuizAnswerPayload | null => {
          if (!answer || typeof answer !== 'object') {
            return null;
          }
          const answerRecord = answer as Record<string, unknown>;
          const answerText = typeof answerRecord.text === 'string' ? answerRecord.text.trim() : '';
          if (!answerText) {
            return null;
          }
          return {
            text: answerText,
            explanation: typeof answerRecord.explanation === 'string' ? answerRecord.explanation.trim() : '',
          };
        })
        .filter((answer): answer is GeneratedQuizAnswerPayload => Boolean(answer));

      if (answers.length < 2) {
        return null;
      }

      return {
        text,
        type: question.type === 'True / False' ? 'True / False' : 'Multiple Choice',
        answers,
        correctAnswerIndex: typeof question.correctAnswerIndex === 'number' ? question.correctAnswerIndex : 0,
      };
    })
    .filter((question): question is GeneratedQuizQuestionPayload => Boolean(question));

  if (questions.length === 0) {
    return null;
  }

  return {
    sourceSummary: typeof quizRecord.sourceSummary === 'string' ? quizRecord.sourceSummary.trim() : '',
    questions,
  };
};

const mapGeneratedQuizToDraft = (generatedQuiz: GeneratedQuizPayload): QuizContent => {
  const mappedQuestions = generatedQuiz.questions.map((question) => {
    const normalizedType: QuizQuestionType = question.type === 'True / False' ? 'True / False' : 'Multiple Choice';
    const normalizedAnswers: QuizAnswer[] = (normalizedType === 'True / False'
      ? question.answers.slice(0, 2)
      : question.answers.slice(0, 4)
    ).map((answer) => ({
      id: createId('a'),
      text: answer.text,
      explanation: answer.explanation ?? '',
    }));

    if (normalizedType === 'True / False' && normalizedAnswers.length < 2) {
      normalizedAnswers.splice(
        0,
        normalizedAnswers.length,
        { id: createId('a'), text: 'True', explanation: '' },
        { id: createId('a'), text: 'False', explanation: '' },
      );
    }

    if (normalizedAnswers.length < 2) {
      const fallbackAnswers = createMultipleChoiceQuestion().answers;
      while (normalizedAnswers.length < 2) {
        normalizedAnswers.push({ ...fallbackAnswers[normalizedAnswers.length], id: createId('a') });
      }
    }

    const safeCorrectIndex = question.correctAnswerIndex >= 0 && question.correctAnswerIndex < normalizedAnswers.length
      ? question.correctAnswerIndex
      : 0;
    const correctAnswerId = normalizedAnswers[safeCorrectIndex]?.id ?? normalizedAnswers[0].id;

    return {
      id: createId('q'),
      text: question.text,
      type: normalizedType,
      answers: normalizedAnswers,
      correctAnswerId,
    };
  });

  return {
    questions: mappedQuestions.length > 0 ? mappedQuestions : [createMultipleChoiceQuestion()],
  };
};

const isQuizDraftEffectivelyEmpty = (quiz: QuizContent): boolean => {
  if (quiz.questions.length === 0) {
    return true;
  }

  return quiz.questions.every((question) => {
    const hasQuestionText = question.text.trim().length > 0;
    const hasAnswerText = question.answers.some((answer) => answer.text.trim().length > 0);
    const hasExplanation = question.answers.some((answer) => (answer.explanation ?? '').trim().length > 0);
    return !hasQuestionText && !hasAnswerText && !hasExplanation;
  });
};

const cloneQuestion = (question: QuizQuestion): QuizQuestion => ({
  ...question,
  id: createId('q'),
  answers: question.answers.map((answer) => ({
    ...answer,
    id: createId('a'),
  })),
  correctAnswerId: '',
});

export const LessonEditor = () => {
  const navigate = useNavigate();
  const { courseId, sectionId, lectureId } = useParams();
  const [searchParams] = useSearchParams();
  const draftId = (searchParams.get('draft') ?? '').trim();
  const courseKey =
    courseId === 'new'
      ? (draftId ? `new:${draftId}` : 'new')
      : courseId ?? 'new';
  const [sections, setSections] = useState<Section[]>(() => getCourseSectionsDraft(courseKey));
  const [uploadedVideoName, setUploadedVideoName] = useState('');
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('');
  const [directVideoUrlInput, setDirectVideoUrlInput] = useState('');
  const [youtubeUrlError, setYoutubeUrlError] = useState<string | null>(null);
  const [lessonVideoUploadError, setLessonVideoUploadError] = useState<string | null>(null);
  const [isUploadingLessonVideo, setIsUploadingLessonVideo] = useState(false);
  const [resourceSaveMessage, setResourceSaveMessage] = useState<string | null>(null);
  const [resourceUploadError, setResourceUploadError] = useState<string | null>(null);
  const [resourceUploadingId, setResourceUploadingId] = useState<string | null>(null);
  const [quizVideoUrlInput, setQuizVideoUrlInput] = useState('');
  const [quizGenerationType, setQuizGenerationType] = useState<QuizGenerationType>('Multiple Choice');
  const [quizGenerationCount, setQuizGenerationCount] = useState(5);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [isUploadingQuizVideo, setIsUploadingQuizVideo] = useState(false);
  const [quizUploadedFileName, setQuizUploadedFileName] = useState('');
  const [quizUploadError, setQuizUploadError] = useState<string | null>(null);
  const [quizAiError, setQuizAiError] = useState<string | null>(null);
  const [quizAiMessage, setQuizAiMessage] = useState<string | null>(null);
  const [quizSaveMessage, setQuizSaveMessage] = useState<string | null>(null);

  const courseBuilderPath = (() => {
    if (courseId === 'new') {
      const params = new URLSearchParams();
      params.set('step', '2');
      if (draftId) {
        params.set('draft', draftId);
      }
      return `/admin/courses/new?${params.toString()}`;
    }
    return `/admin/courses/${courseId ?? 'new'}?step=2`;
  })();

  const lessonRecord = useMemo(() => {
    if (!sectionId || !lectureId) {
      return null;
    }

    return findLectureInSections(sections, sectionId, lectureId);
  }, [lectureId, sectionId, sections]);

  const persistSections = (nextSections: Section[]) => {
    setSections(nextSections);
    saveCourseSectionsDraft(courseKey, nextSections);
  };

  const updateLecture = (updates: Partial<Lecture>) => {
    if (!sectionId || !lectureId) {
      return;
    }

    const nextSections = sections.map((section) =>
      section.id === sectionId
        ? {
            ...section,
            lectures: section.lectures.map((lecture) =>
              lecture.id === lectureId ? { ...lecture, ...updates } : lecture,
            ),
          }
        : section,
    );

    persistSections(nextSections);
  };

  if (!lessonRecord) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-4">
          <h1 className="text-xl font-bold text-slate-900">Lesson not found</h1>
          <p className="text-slate-500">This lesson no longer exists in the current draft.</p>
          <Link
            to={courseBuilderPath}
            className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Curriculum
          </Link>
        </div>
      </div>
    );
  }

  const { section, lecture } = lessonRecord;
  const quizFromLecture = useMemo(() => parseQuizContent(lecture.content ?? ''), [lecture.content]);
  const resourcesFromLecture = useMemo(() => parseResourcesContent(lecture.content ?? ''), [lecture.content]);
  const [quizDraft, setQuizDraft] = useState<QuizContent>(quizFromLecture);
  const [resourcesDraft, setResourcesDraft] = useState<ResourceContent>(resourcesFromLecture);

  useEffect(() => {
    setQuizDraft(quizFromLecture);
    setQuizSaveMessage(null);
  }, [lecture.id, quizFromLecture]);

  useEffect(() => {
    setResourcesDraft(resourcesFromLecture);
    setResourceSaveMessage(null);
    setResourceUploadError(null);
    setResourceUploadingId(null);
  }, [lecture.id, resourcesFromLecture]);

  useEffect(() => {
    if (lecture.type !== 'Video') {
      setYoutubeUrlInput('');
      setDirectVideoUrlInput('');
      setYoutubeUrlError(null);
      setLessonVideoUploadError(null);
      setIsUploadingLessonVideo(false);
      return;
    }

    const savedVideoUrl = lecture.videoUrl ?? '';
    const hasYoutubeId = extractYoutubeVideoId(savedVideoUrl) !== null;
    if (hasYoutubeId) {
      setYoutubeUrlInput(savedVideoUrl);
      setDirectVideoUrlInput('');
    } else {
      setYoutubeUrlInput('');
      setDirectVideoUrlInput(savedVideoUrl);
    }
    setYoutubeUrlError(null);
  }, [lecture.id, lecture.type, lecture.videoUrl]);

  useEffect(() => {
    setQuizVideoUrlInput(lecture.videoUrl ?? '');
    setQuizGenerationType('Multiple Choice');
    setQuizGenerationCount(5);
    setIsUploadingQuizVideo(false);
    setQuizUploadedFileName('');
    setQuizUploadError(null);
    setQuizAiError(null);
    setQuizAiMessage(null);
    setQuizSaveMessage(null);
  }, [lecture.id, lecture.videoUrl]);

  const persistQuizDraft = () => {
    const nextQuizDraft = quizDraft.questions.length > 0 ? quizDraft : createDefaultQuizContent();
    if (serializeQuizContent(nextQuizDraft) === serializeQuizContent(quizFromLecture)) {
      setQuizSaveMessage('No changes to save.');
      return;
    }

    setQuizDraft(nextQuizDraft);
    updateLecture({ content: serializeQuizContent(nextQuizDraft) });
    setQuizSaveMessage('Changes saved.');
  };

  const discardQuizDraft = () => {
    const resetQuizDraft = quizFromLecture.questions.length > 0 ? quizFromLecture : createDefaultQuizContent();
    if (serializeQuizContent(quizDraft) === serializeQuizContent(resetQuizDraft)) {
      setQuizSaveMessage('No changes to discard.');
      return;
    }

    setQuizDraft(resetQuizDraft);
    setQuizSaveMessage('Changes discarded.');
  };

  const persistResourcesDraft = () => {
    const normalizedResources: ResourceContent = {
      items: resourcesDraft.items.map((item) => ({
        ...item,
        fileData: item.url ? '' : item.fileData || '',
      })),
    };

    setResourcesDraft(normalizedResources);
    updateLecture({
      content: serializeResourcesContent(normalizedResources),
      duration: undefined,
      videoUrl: undefined,
    });
    setResourceSaveMessage('Resources saved.');
  };

  const handleGenerateQuizFromVideo = async () => {
    const sourceUrl = quizVideoUrlInput.trim() || lecture.videoUrl?.trim() || '';
    if (!sourceUrl) {
      setQuizAiError('Add a video URL first so AI can generate quiz questions.');
      setQuizAiMessage(null);
      return;
    }

    setIsGeneratingQuiz(true);
    setQuizAiError(null);
    setQuizAiMessage(null);
    setQuizSaveMessage(null);

    try {
      const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/courses/generate-quiz-from-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoUrl: sourceUrl,
          lessonTitle: lecture.title,
          questionCount: quizGenerationCount,
          questionType: quizGenerationType,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setQuizAiError(extractApiMessage(payload) ?? 'Unable to generate quiz right now.');
        return;
      }

      const generatedQuiz = parseGeneratedQuizPayload(payload);
      if (!generatedQuiz) {
        setQuizAiError('AI returned an invalid quiz format.');
        return;
      }

      const mappedQuizDraft = mapGeneratedQuizToDraft(generatedQuiz);
      const shouldReplaceExisting = isQuizDraftEffectivelyEmpty(quizDraft);
      const nextQuestions = shouldReplaceExisting
        ? mappedQuizDraft.questions
        : [...quizDraft.questions, ...mappedQuizDraft.questions];
      const nextQuizDraft: QuizContent = { questions: nextQuestions };
      setQuizDraft(nextQuizDraft);
      updateLecture({
        content: serializeQuizContent(nextQuizDraft),
        videoUrl: sourceUrl,
      });

      const apiMessage = extractApiMessage(payload);
      const summary = generatedQuiz.sourceSummary ? ` ${generatedQuiz.sourceSummary}` : '';
      if (apiMessage) {
        setQuizAiMessage(apiMessage);
      } else {
        const generatedCount = mappedQuizDraft.questions.length;
        const startNumber = shouldReplaceExisting ? 1 : (quizDraft.questions.length + 1);
        const endNumber = startNumber + generatedCount - 1;
        const numberLabel = generatedCount === 1 ? `No. ${startNumber}` : `No. ${startNumber}-${endNumber}`;
        setQuizAiMessage(`Generated ${generatedCount} item${generatedCount === 1 ? '' : 's'} (${numberLabel}) and saved.${summary}`);
      }
    } catch {
      setQuizAiError('Cannot reach AI service. Please try again.');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleQuizVideoUpload = async (file: File) => {
    setQuizUploadError(null);
    setIsUploadingQuizVideo(true);
    setQuizUploadedFileName(file.name);
    setQuizAiError(null);
    setQuizAiMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/uploads/lesson-video`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setQuizUploadedFileName('');
        setQuizUploadError(extractApiMessage(payload) ?? 'Unable to upload video file.');
        return;
      }

      if (!payload || typeof payload !== 'object') {
        setQuizUploadedFileName('');
        setQuizUploadError('Unexpected response from video upload service.');
        return;
      }

      const record = payload as Record<string, unknown>;
      const asset = record.asset as Record<string, unknown> | null;
      const uploadedUrl = asset && typeof asset.url === 'string' ? asset.url : '';
      const uploadedFileName = asset && typeof asset.fileName === 'string' ? asset.fileName : file.name;

      if (record.success !== true || !uploadedUrl) {
        setQuizUploadedFileName('');
        setQuizUploadError('Unexpected response from video upload service.');
        return;
      }

      setQuizUploadedFileName(uploadedFileName);
      setQuizVideoUrlInput(uploadedUrl);
      updateLecture({ videoUrl: uploadedUrl });
    } catch {
      setQuizUploadedFileName('');
      setQuizUploadError('Cannot reach upload service. Please try again.');
    } finally {
      setIsUploadingQuizVideo(false);
    }
  };

  const handleLessonVideoUpload = async (file: File) => {
    setLessonVideoUploadError(null);
    setIsUploadingLessonVideo(true);
    setUploadedVideoName(file.name);

    try {
      const detectedDuration = await readVideoDuration(file);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/uploads/lesson-video`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setUploadedVideoName('');
        setLessonVideoUploadError(extractApiMessage(payload) ?? 'Unable to upload lesson video.');
        return;
      }

      if (!payload || typeof payload !== 'object') {
        setUploadedVideoName('');
        setLessonVideoUploadError('Unexpected response from lesson video upload service.');
        return;
      }

      const record = payload as Record<string, unknown>;
      const asset = record.asset as Record<string, unknown> | null;
      const uploadedUrl = asset && typeof asset.url === 'string' ? asset.url : '';
      const uploadedFileName = asset && typeof asset.fileName === 'string' ? asset.fileName : file.name;

      if (record.success !== true || !uploadedUrl) {
        setUploadedVideoName('');
        setLessonVideoUploadError('Unexpected response from lesson video upload service.');
        return;
      }

      setUploadedVideoName(uploadedFileName);
      setDirectVideoUrlInput(uploadedUrl);
      setYoutubeUrlInput('');
      setYoutubeUrlError(null);
      updateLecture({
        videoUrl: uploadedUrl,
        ...(detectedDuration ? { duration: formatDurationFromSeconds(detectedDuration) } : {}),
      });
    } catch {
      setUploadedVideoName('');
      setLessonVideoUploadError('Cannot reach upload service. Please try again.');
    } finally {
      setIsUploadingLessonVideo(false);
    }
  };

  const handleSaveLesson = () => {
    if (lecture.type === 'Quiz') {
      persistQuizDraft();
    }
    if (lecture.type === 'Resource') {
      persistResourcesDraft();
    }
    navigate(courseBuilderPath);
  };

  const updateQuestion = (questionId: string, updater: (question: QuizQuestion) => QuizQuestion) => {
    setQuizSaveMessage(null);
    setQuizDraft((previous) => ({
      ...previous,
      questions: previous.questions.map((question) =>
        question.id === questionId ? updater(question) : question,
      ),
    }));
  };

  const duplicateQuestion = (questionId: string) => {
    setQuizSaveMessage(null);
    setQuizDraft((previous) => {
      const nextQuestions: QuizQuestion[] = [];
      previous.questions.forEach((question) => {
        nextQuestions.push(question);
        if (question.id === questionId) {
          const duplicated = cloneQuestion(question);
          duplicated.correctAnswerId = duplicated.answers[0]?.id ?? '';
          nextQuestions.push(duplicated);
        }
      });

      return { ...previous, questions: nextQuestions };
    });
  };

  const removeQuestion = (questionId: string) => {
    setQuizSaveMessage(null);
    setQuizDraft((previous) => {
      const filtered = previous.questions.filter((question) => question.id !== questionId);
      return {
        ...previous,
        questions: filtered.length > 0 ? filtered : [createMultipleChoiceQuestion()],
      };
    });
  };

  const addQuestion = () => {
    setQuizSaveMessage(null);
    setQuizDraft((previous) => ({
      ...previous,
      questions: [...previous.questions, createMultipleChoiceQuestion()],
    }));
  };

  const addAnswerOption = (questionId: string) => {
    setQuizSaveMessage(null);
    updateQuestion(questionId, (question) => ({
      ...question,
      answers: [...question.answers, { id: createId('a'), text: '', explanation: '' }],
    }));
  };

  const removeAnswerOption = (questionId: string, answerId: string) => {
    setQuizSaveMessage(null);
    updateQuestion(questionId, (question) => {
      if (question.type !== 'Multiple Choice' || question.answers.length <= 2) {
        return question;
      }

      const nextAnswers = question.answers.filter((answer) => answer.id !== answerId);
      return {
        ...question,
        answers: nextAnswers,
        correctAnswerId: question.correctAnswerId === answerId ? nextAnswers[0].id : question.correctAnswerId,
      };
    });
  };

  const addResource = () => {
    setResourceSaveMessage(null);
    setResourcesDraft((previous) => ({
      ...previous,
      items: [...previous.items, createDefaultResource()],
    }));
  };

  const updateResource = (resourceId: string, updates: Partial<ResourceItem>) => {
    setResourceSaveMessage(null);
    setResourcesDraft((previous) => ({
      ...previous,
      items: previous.items.map((item) => (item.id === resourceId ? { ...item, ...updates } : item)),
    }));
  };

  const removeResource = (resourceId: string) => {
    setResourceSaveMessage(null);
    setResourcesDraft((previous) => ({
      ...previous,
      items: previous.items.filter((item) => item.id !== resourceId),
    }));
  };

  const handleResourceFileUpload = async (resourceId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const input = event.target;
    setResourceSaveMessage(null);
    setResourceUploadError(null);
    setResourceUploadingId(resourceId);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/uploads/resource-file`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setResourceUploadError(extractApiMessage(payload) ?? 'Unable to upload resource file.');
        return;
      }

      if (!payload || typeof payload !== 'object') {
        setResourceUploadError('Unexpected response from resource upload service.');
        return;
      }

      const record = payload as Record<string, unknown>;
      const asset = record.asset as Record<string, unknown> | null;
      const uploadedUrl = asset && typeof asset.url === 'string' ? asset.url : '';
      const uploadedFileName = asset && typeof asset.fileName === 'string' ? asset.fileName : file.name;

      if (record.success !== true || !uploadedUrl) {
        setResourceUploadError('Unexpected response from resource upload service.');
        return;
      }

      updateResource(resourceId, {
        title: file.name,
        size: formatFileSize(file.size),
        fileName: uploadedFileName,
        mimeType: file.type || 'application/octet-stream',
        url: uploadedUrl,
        fileData: '',
      });
      setResourceSaveMessage('File uploaded. Save resources to apply.');
    } catch {
      setResourceUploadError('Cannot reach upload service. Please try again.');
    } finally {
      setResourceUploadingId(null);
      input.value = '';
    }
  };

  const youtubeEmbedUrl = useMemo(() => {
    const videoId = extractYoutubeVideoId(youtubeUrlInput || lecture.videoUrl || '');
    if (!videoId) {
      return null;
    }

    return `https://www.youtube.com/embed/${videoId}`;
  }, [lecture.videoUrl, youtubeUrlInput]);

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to={courseBuilderPath} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {lecture.type === 'Quiz' ? 'Editing Quiz' : 'Lesson Editor'}
            </h1>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Section: {section.title}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSaveLesson}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-200 active:scale-95 inline-flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          Save Lesson
        </button>
      </header>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-8">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Lesson Title</label>
          <input
            type="text"
            value={lecture.title}
            onChange={(event) => updateLecture({ title: event.target.value })}
            placeholder="e.g. Introduction to Components"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
          />
        </div>

        {lecture.type === 'Quiz' ? (
          <div className="space-y-8">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_120px_auto] md:items-end">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Video URL for AI Quiz Generation</label>
                  <input
                    type="url"
                    value={quizVideoUrlInput}
                    onChange={(event) => {
                      setQuizVideoUrlInput(event.target.value);
                      setQuizUploadedFileName('');
                      setQuizUploadError(null);
                      setQuizAiError(null);
                      setQuizAiMessage(null);
                    }}
                    placeholder="https://www.youtube.com/watch?v=VIDEO_ID"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Question Type</label>
                  <select
                    value={quizGenerationType}
                    onChange={(event) => {
                      setQuizGenerationType(event.target.value as QuizGenerationType);
                      setQuizAiError(null);
                      setQuizAiMessage(null);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  >
                    <option value="Multiple Choice">Multiple Choice</option>
                    <option value="True / False">True / False</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Items</label>
                  <select
                    value={String(quizGenerationCount)}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      const safeCount = Number.isFinite(parsed) ? Math.min(10, Math.max(1, Math.round(parsed))) : 5;
                      setQuizGenerationCount(safeCount);
                      setQuizAiError(null);
                      setQuizAiMessage(null);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  >
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateQuizFromVideo}
                  disabled={isGeneratingQuiz}
                  className="inline-flex h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Sparkles className="h-4 w-4" />
                  {isGeneratingQuiz ? 'Generating...' : 'Generate Quiz'}
                </button>
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-700">Upload Video File (Optional)</p>
                  <p className="text-xs text-slate-500">Upload a video file and we will use it as the quiz source.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    id="quiz-video-upload"
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      await handleQuizVideoUpload(file);
                      event.target.value = '';
                    }}
                  />
                  <label
                    htmlFor="quiz-video-upload"
                    className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors ${
                      isUploadingQuizVideo ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-slate-100'
                    }`}
                  >
                    <Upload className="h-4 w-4 text-slate-400" />
                    {isUploadingQuizVideo ? 'Uploading...' : 'Upload Video'}
                  </label>
                  {quizUploadedFileName ? (
                    <span className="text-[11px] font-medium text-indigo-600">{quizUploadedFileName}</span>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Paste a YouTube link or upload a video file to let AI analyze metadata and generate quiz questions with answers.
              </p>
              {quizUploadError ? <p className="text-sm font-medium text-red-600">{quizUploadError}</p> : null}
              {quizAiError ? <p className="text-sm font-medium text-red-600">{quizAiError}</p> : null}
              {quizAiMessage ? <p className="text-sm font-medium text-emerald-600">{quizAiMessage}</p> : null}
            </div>

            <div className="space-y-6">
              {quizDraft.questions.map((question, questionIndex) => (
                <div key={question.id} className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold bg-slate-200 text-slate-700 px-2 py-1 rounded">Question {questionIndex + 1}</span>
                      <span className="text-sm font-semibold text-slate-500">{question.type}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-400">
                      <button type="button" onClick={() => duplicateQuestion(question.id)} className="hover:text-slate-700">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => removeQuestion(question.id)} className="hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="p-5 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-3 space-y-2">
                        <label className="text-sm font-bold text-slate-700">Question Text</label>
                        <textarea
                          value={question.text}
                          onChange={(event) => updateQuestion(question.id, (current) => ({ ...current, text: event.target.value }))}
                          placeholder="Enter your question here..."
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none min-h-[110px] focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Question Type</label>
                        <select
                          value={question.type}
                          onChange={(event) => {
                            const nextType = event.target.value as QuizQuestionType;
                            updateQuestion(question.id, () =>
                              nextType === 'True / False' ? createTrueFalseQuestion() : createMultipleChoiceQuestion(),
                            );
                          }}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                        >
                          <option value="Multiple Choice">Multiple Choice</option>
                          <option value="True / False">True / False</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-800">Answers</h4>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Correct</span>
                      </div>

                      {question.answers.map((answer) => (
                        <div key={answer.id} className="border border-slate-200 rounded-xl p-3 space-y-3">
                          <div className="flex items-center gap-3">
                            <input
                              type="text"
                              value={answer.text}
                              onChange={(event) =>
                                updateQuestion(question.id, (current) => ({
                                  ...current,
                                  answers: current.answers.map((currentAnswer) =>
                                    currentAnswer.id === answer.id
                                      ? { ...currentAnswer, text: event.target.value }
                                      : currentAnswer,
                                  ),
                                }))
                              }
                              placeholder="Answer option"
                              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                              disabled={question.type === 'True / False'}
                            />

                            <button
                              type="button"
                              onClick={() => updateQuestion(question.id, (current) => ({ ...current, correctAnswerId: answer.id }))}
                              className="text-indigo-600"
                              aria-label="Set as correct answer"
                            >
                              {question.correctAnswerId === answer.id ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5 text-slate-300" />}
                            </button>

                            {question.type === 'Multiple Choice' ? (
                              <button
                                type="button"
                                onClick={() => removeAnswerOption(question.id, answer.id)}
                                className="text-slate-400 hover:text-red-600"
                                aria-label="Remove option"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            ) : null}
                          </div>

                          {question.type === 'Multiple Choice' ? (
                            <input
                              type="text"
                              value={answer.explanation ?? ''}
                              onChange={(event) =>
                                updateQuestion(question.id, (current) => ({
                                  ...current,
                                  answers: current.answers.map((currentAnswer) =>
                                    currentAnswer.id === answer.id
                                      ? { ...currentAnswer, explanation: event.target.value }
                                      : currentAnswer,
                                  ),
                                }))
                              }
                              placeholder="Add explanation for this answer (optional)..."
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-sm"
                            />
                          ) : null}
                        </div>
                      ))}

                      {question.type === 'Multiple Choice' ? (
                        <button
                          type="button"
                          onClick={() => addAnswerOption(question.id)}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          <PlusCircle className="w-4 h-4" />
                          Add Option
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addQuestion}
                className="w-full py-8 border-2 border-dashed border-slate-300 rounded-2xl text-slate-500 font-semibold hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-5 h-5" />
                Add New Question
              </button>

              <div className="flex items-center justify-end gap-3 pt-2">
                {quizSaveMessage ? (
                  <p className="mr-auto text-sm font-medium text-emerald-600">{quizSaveMessage}</p>
                ) : null}
                <button
                  type="button"
                  onClick={discardQuizDraft}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Discard Changes
                </button>
                <button
                  type="button"
                  onClick={persistQuizDraft}
                  className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {lecture.type !== 'Resource' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Duration</label>
                  <input
                    type="text"
                    value={lecture.duration ?? ''}
                    onChange={(event) => updateLecture({ duration: event.target.value })}
                    placeholder="e.g. 08:30"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>
            ) : null}

            {lecture.type === 'Video' ? (
                <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Lesson Video</label>
                  <input
                      id="lesson-video-upload"
                      type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      await handleLessonVideoUpload(file);
                      event.target.value = '';
                    }}
                  />
                  <label
                    htmlFor="lesson-video-upload"
                    className="aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 transition-all text-slate-500"
                  >
                    <Upload className="w-8 h-8 text-slate-300" />
                    <span className="text-xs font-bold">{isUploadingLessonVideo ? 'Uploading...' : 'Upload Video'}</span>
                    {uploadedVideoName ? <span className="text-[11px] text-indigo-600">{uploadedVideoName}</span> : null}
                  </label>
                  {lessonVideoUploadError ? <p className="text-xs font-medium text-red-600">{lessonVideoUploadError}</p> : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">YouTube Video Link</label>
                  <input
                    type="url"
                    value={youtubeUrlInput}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setYoutubeUrlInput(nextValue);
                      setDirectVideoUrlInput('');
                      setUploadedVideoName('');
                      setLessonVideoUploadError(null);

                      if (!nextValue.trim()) {
                        setYoutubeUrlError(null);
                        updateLecture({ videoUrl: '' });
                        return;
                      }

                      const hasYoutubeId = extractYoutubeVideoId(nextValue) !== null;
                      setYoutubeUrlError(hasYoutubeId ? null : 'Enter a valid YouTube URL.');
                      updateLecture({ videoUrl: nextValue });
                    }}
                    onBlur={() => {
                      if (!youtubeUrlInput.trim()) {
                        return;
                      }

                      const normalized = normalizeYoutubeUrl(youtubeUrlInput);
                      setYoutubeUrlInput(normalized);
                      updateLecture({ videoUrl: normalized });
                    }}
                    placeholder="https://www.youtube.com/watch?v=VIDEO_ID"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                  />
                  {youtubeUrlError ? <p className="text-xs font-medium text-red-600">{youtubeUrlError}</p> : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Direct Video URL (Optional)</label>
                  <input
                    type="url"
                    value={directVideoUrlInput}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setDirectVideoUrlInput(nextValue);
                      setYoutubeUrlInput('');
                      setYoutubeUrlError(null);
                      setUploadedVideoName('');
                      setLessonVideoUploadError(null);
                      updateLecture({ videoUrl: nextValue });
                    }}
                    placeholder="https://example.com/video.mp4"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                  />
                  <p className="text-xs text-slate-500">Use this only when the lesson is not hosted on YouTube.</p>
                </div>

                {youtubeEmbedUrl ? (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">YouTube Preview</label>
                    <div className="aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-black">
                      <iframe
                        src={youtubeEmbedUrl}
                        title="YouTube lesson preview"
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : lecture.type === 'Resource' ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Downloadable Resources</h3>
                  <button
                    type="button"
                    onClick={addResource}
                    className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Add Resource
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  {resourcesDraft.items.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
                      <p className="text-sm text-slate-500">No resources added yet.</p>
                    </div>
                  ) : (
                    resourcesDraft.items.map((resource) => {
                      const isResourceUploading = resourceUploadingId === resource.id;
                      return (
                        <div key={resource.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                          {resource.kind === 'link' ? <Link2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        </div>

                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={resource.title}
                            onChange={(event) => updateResource(resource.id, { title: event.target.value })}
                            placeholder={resource.kind === 'link' ? 'e.g. Github Project Repository' : 'e.g. Course_Syllabus.pdf'}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                          />

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <select
                              value={resource.kind}
                              onChange={(event) =>
                                updateResource(resource.id, {
                                  kind: event.target.value as ResourceKind,
                                  url: event.target.value === 'link' ? resource.url : '',
                                })
                              }
                              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-sm"
                            >
                              <option value="file">File</option>
                              <option value="link">External Link</option>
                            </select>

                            {resource.kind === 'link' ? (
                              <input
                                type="url"
                                value={resource.url ?? ''}
                                onChange={(event) => updateResource(resource.id, { url: event.target.value })}
                                placeholder="https://..."
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-sm"
                              />
                            ) : (
                              <input
                                type="text"
                                value={resource.size ?? ''}
                                readOnly
                                placeholder="Upload a file"
                                className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg outline-none text-sm text-slate-500"
                              />
                            )}
                          </div>

                          {resource.kind === 'file' ? (
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <label
                                className={`inline-flex items-center gap-2 text-sm font-semibold ${
                                  isResourceUploading ? 'cursor-wait text-slate-400' : 'cursor-pointer text-indigo-600 hover:text-indigo-700'
                                }`}
                              >
                                <Upload className="w-4 h-4" />
                                {isResourceUploading ? 'Uploading...' : resource.fileName ? 'Replace File' : 'Upload File'}
                                <input
                                  type="file"
                                  className="hidden"
                                  disabled={isResourceUploading}
                                  onChange={(event) => handleResourceFileUpload(resource.id, event)}
                                />
                              </label>
                              {resource.fileName ? (
                                <p className="text-xs text-slate-500">
                                  {resource.fileName}
                                  {resource.mimeType ? ` • ${resource.mimeType}` : ''}
                                </p>
                              ) : (
                                <p className="text-xs text-slate-400">No file uploaded yet.</p>
                              )}
                            </div>
                          ) : null}

                          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                            {resource.kind === 'link' ? 'External Link' : resource.mimeType || 'File Resource'}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeResource(resource.id)}
                          className="text-slate-400 hover:text-red-600 p-1"
                          aria-label="Remove resource"
                        >
s                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      );
                    })
                  )}
                </div>

                <div className="px-4 pb-4 flex items-center justify-end gap-3">
                  {resourceUploadError ? (
                    <p className="mr-auto text-sm font-medium text-red-600">{resourceUploadError}</p>
                  ) : resourceSaveMessage ? (
                    <p className="mr-auto text-sm font-medium text-emerald-600">{resourceSaveMessage}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setResourcesDraft(resourcesFromLecture);
                      setResourceSaveMessage(null);
                    }}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200/60 rounded-lg"
                  >
                    Discard Changes
                  </button>
                  <button
                    type="button"
                    onClick={persistResourcesDraft}
                    className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                  >
                    Save Resources
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Lesson Description</label>
                <textarea
                  value={lecture.content ?? ''}
                  onChange={(event) => updateLecture({ content: event.target.value })}
                  placeholder="Describe the lesson, resources, and what students should do..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none min-h-[180px] focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all"
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
