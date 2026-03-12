import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Save, Eye, Plus, Video, FileText, HelpCircle, Trash2, GripVertical, CheckCircle2, Circle, Bold, Italic, List, Upload, X, Sparkles } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CATEGORIES, LEVELS, LANGUAGES, cn } from '../../utils';
import { Section, Lecture, ContentType } from '../../types';
import { getCourseSectionsDraft, hasStoredCourseSectionsDraft, saveCourseSectionsDraft } from '../../admin/courseDraftStore';
import { API_BASE_URL as COURSE_API_BASE_URL } from '../../lib/apiBase';
import { ConfirmDialog } from '../../components/ConfirmDialog';

const createDraftId = () => `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 30 * 1024 * 1024;
const SECTION_TITLE_DELIMITER = '::';

const buildSectionTitle = (sectionTitle: string, subsectionTitle: string) => {
  const normalizedSection = sectionTitle.trim() || 'Section';
  const normalizedSubsection = subsectionTitle.trim() || 'Subsection';
  return `${normalizedSection} ${SECTION_TITLE_DELIMITER} ${normalizedSubsection}`;
};

const parseSectionTitle = (title: string) => {
  const parts = title.split(SECTION_TITLE_DELIMITER).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      sectionTitle: parts[0],
      subsectionTitle: parts.slice(1).join(` ${SECTION_TITLE_DELIMITER} `).trim(),
    };
  }

  return {
    sectionTitle: '',
    subsectionTitle: title.trim(),
  };
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
    const first = record.detail[0];
    if (first && typeof first === 'object') {
      const firstRecord = first as Record<string, unknown>;
      if (typeof firstRecord.msg === 'string') {
        return firstRecord.msg;
      }
    }
  }

  return undefined;
};

const parseUploadedAsset = (payload: unknown): { url: string; fileName: string } | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.success !== true || !record.asset || typeof record.asset !== 'object') {
    return null;
  }

  const asset = record.asset as Record<string, unknown>;
  if (typeof asset.url !== 'string' || typeof asset.fileName !== 'string') {
    return null;
  }

  const url = asset.url.trim();
  const fileName = asset.fileName.trim();
  if (!url || !fileName) {
    return null;
  }

  return { url, fileName };
};

const getAssetFileNameFromValue = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('uploaded://')) {
    const rawFileName = normalized.slice('uploaded://'.length);
    try {
      return decodeURIComponent(rawFileName);
    } catch {
      return rawFileName;
    }
  }

  try {
    const parsed = new URL(normalized);
    const fileName = parsed.pathname.split('/').filter(Boolean).pop();
    return fileName ? decodeURIComponent(fileName) : '';
  } catch {
    const fileName = normalized.split('/').filter(Boolean).pop();
    return fileName ? decodeURIComponent(fileName) : '';
  }
};

const sanitizePersistedAssetUrl = (value: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized.startsWith('uploaded://')) {
    return '';
  }

  return normalized;
};

const parseGeneratedCourseContent = (
  payload: unknown,
): { description: string; learningOutcomes: string[]; message?: string } | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.success !== true) {
    return null;
  }

  if (!record.content || typeof record.content !== 'object') {
    return null;
  }

  const content = record.content as Record<string, unknown>;
  const description = typeof content.description === 'string' ? content.description.trim() : '';
  if (!description) {
    return null;
  }

  const learningOutcomes = Array.isArray(content.learningOutcomes)
    ? content.learningOutcomes
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
    : [];
  const message = typeof record.message === 'string' ? record.message.trim() : undefined;

  return {
    description,
    learningOutcomes,
    message,
  };
};

const parseGeneratedAutomatedMessages = (
  payload: unknown,
): {
  welcomeMessage: string;
  reminderMessage: string;
  congratulationsMessage: string;
  message?: string;
} | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.success !== true || !record.messages || typeof record.messages !== 'object') {
    return null;
  }

  const messages = record.messages as Record<string, unknown>;
  const welcomeMessage =
    typeof messages.welcomeMessage === 'string' ? messages.welcomeMessage.trim() : '';
  const reminderMessage =
    typeof messages.reminderMessage === 'string' ? messages.reminderMessage.trim() : '';
  const congratulationsMessage =
    typeof messages.congratulationsMessage === 'string'
      ? messages.congratulationsMessage.trim()
      : '';
  if (!welcomeMessage || !reminderMessage || !congratulationsMessage) {
    return null;
  }

  const message = typeof record.message === 'string' ? record.message.trim() : undefined;
  return {
    welcomeMessage,
    reminderMessage,
    congratulationsMessage,
    message,
  };
};

const steps = [
  { id: 1, label: 'Course Landing Page' },
  { id: 2, label: 'Curriculum' },
  { id: 3, label: 'Automated Messages' },
  { id: 4, label: 'Settings' },
];

type DeleteTarget =
  | {
      type: 'section-group';
      sectionIds: string[];
      title: string;
      message: string;
    }
  | {
      type: 'subsection';
      sectionId: string;
      title: string;
      message: string;
    }
  | {
      type: 'lecture';
      sectionId: string;
      lectureId: string;
      title: string;
      message: string;
    };

type SectionGroup = {
  id: string;
  title: string;
  subsections: Array<{ section: Section; title: string }>;
};

export const CourseCreator = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const draftIdParam = (searchParams.get('draft') ?? '').trim();
  const [pendingDraftId] = useState(() => (!id && !draftIdParam ? createDraftId() : ''));
  const draftId = draftIdParam || pendingDraftId;
  const courseKey = id ?? (draftId ? `new:${draftId}` : 'new');
  const routeCourseId = id ?? 'new';
  const getStepFromQuery = () => {
    const step = Number(searchParams.get('step'));
    return Number.isInteger(step) && step >= 1 && step <= 4 ? step : 1;
  };
  const [activeStep, setActiveStep] = useState(getStepFromQuery());
  const [courseTitle, setCourseTitle] = useState('');
  const [courseSubtitle, setCourseSubtitle] = useState('');
  const [courseDescription, setCourseDescription] = useState('');
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [level, setLevel] = useState(LEVELS[0]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [courseImage, setCourseImage] = useState('');
  const [promoVideo, setPromoVideo] = useState('');
  const [courseImageFileName, setCourseImageFileName] = useState('');
  const [promoVideoFileName, setPromoVideoFileName] = useState('');
  const [targetStudentsInput, setTargetStudentsInput] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [congratulationsMessage, setCongratulationsMessage] = useState('');
  const [courseStatus, setCourseStatus] = useState<'Draft' | 'Published'>('Draft');
  const [visibility, setVisibility] = useState<'Public' | 'Private'>('Public');
  const [enrollmentStatus, setEnrollmentStatus] = useState<'Open' | 'Closed'>('Open');
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isGeneratingMessageAi, setIsGeneratingMessageAi] = useState(false);
  const [isUploadingCourseImage, setIsUploadingCourseImage] = useState(false);
  const [isUploadingPromoVideo, setIsUploadingPromoVideo] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>(() => {
    if (!id && !draftId) {
      return [];
    }
    return getCourseSectionsDraft(courseKey);
  });
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const sectionGroups = useMemo<SectionGroup[]>(() => {
    const groups: SectionGroup[] = [];
    const groupMap = new Map<string, SectionGroup>();

    sections.forEach((section, index) => {
      const parsed = parseSectionTitle(section.title);
      const sectionTitle = parsed.sectionTitle || `Section ${index + 1}`;
      const subsectionTitle = parsed.subsectionTitle || `Subsection ${index + 1}`;
      const existing = groupMap.get(sectionTitle);
      const group = existing ?? { id: section.id, title: sectionTitle, subsections: [] };

      group.subsections.push({ section, title: subsectionTitle });
      if (!existing) {
        groupMap.set(sectionTitle, group);
        groups.push(group);
      }
    });

    return groups;
  }, [sections]);

  const setAndPersistSections = (nextSections: Section[]) => {
    setSections(nextSections);
    saveCourseSectionsDraft(courseKey, nextSections);
  };

  const addSectionGroup = () => {
    const nextIndex = sectionGroups.length + 1;
    const newSectionTitle = `Section ${nextIndex}`;
    const newSubsectionTitle = 'New Subsection';
    const newSection: Section = {
      id: `s${Date.now()}`,
      title: buildSectionTitle(newSectionTitle, newSubsectionTitle),
      lectures: [],
    };
    setAndPersistSections([...sections, newSection]);
  };

  const addSubsection = (sectionTitle: string) => {
    const newSection: Section = {
      id: `s${Date.now()}`,
      title: buildSectionTitle(sectionTitle, 'New Subsection'),
      lectures: [],
    };
    setAndPersistSections([...sections, newSection]);
  };

  const updateSectionGroupTitle = (group: SectionGroup, value: string) => {
    const nextTitle = value.trim() || 'Untitled Section';
    const nextSections = sections.map((section) => {
      const subsection = group.subsections.find((item) => item.section.id === section.id);
      if (!subsection) {
        return section;
      }
      const subsectionTitle = subsection.title.trim() || 'Untitled Subsection';
      return { ...section, title: buildSectionTitle(nextTitle, subsectionTitle) };
    });
    setAndPersistSections(nextSections);
  };

  const updateSubsectionTitle = (sectionTitle: string, sectionId: string, value: string) => {
    const nextSubsectionTitle = value.trim() || 'Untitled Subsection';
    const nextSectionTitle = sectionTitle.trim() || 'Untitled Section';
    const nextSections = sections.map((section) =>
      section.id === sectionId
        ? { ...section, title: buildSectionTitle(nextSectionTitle, nextSubsectionTitle) }
        : section,
    );
    setAndPersistSections(nextSections);
  };

  const removeSectionGroup = (group: SectionGroup) => {
    setDeleteTarget({
      type: 'section-group',
      sectionIds: group.subsections.map((item) => item.section.id),
      title: group.title,
      message: `Delete "${group.title}" and all of its subsections?`,
    });
  };

  const removeSubsection = (sectionId: string) => {
    const subsectionToRemove = sections.find((section) => section.id === sectionId);
    if (!subsectionToRemove) {
      return;
    }

    const parsed = parseSectionTitle(subsectionToRemove.title);
    const subsectionTitle = parsed.subsectionTitle || subsectionToRemove.title;
    setDeleteTarget({
      type: 'subsection',
      sectionId,
      title: subsectionTitle,
      message: `Delete "${subsectionTitle}" and all of its lessons?`,
    });
  };

  const addContentItem = (sectionId: string, type: ContentType) => {
    const defaultByType: Record<ContentType, Partial<Lecture>> = {
      Video: { title: 'New Lecture', duration: '05:00', videoUrl: '' },
      Quiz: { title: 'New Quiz', duration: '03:00', content: '' },
      Resource: { title: 'New Resource', content: '' },
      Article: { title: 'New Article', content: '' },
    };

    const newLecture: Lecture = {
      id: `l${Date.now()}`,
      type,
      title: defaultByType[type].title ?? 'New Content',
      duration: defaultByType[type].duration,
      content: defaultByType[type].content,
      videoUrl: defaultByType[type].videoUrl,
    };

    const nextSections = sections.map((section) =>
        section.id === sectionId
          ? { ...section, lectures: [...section.lectures, newLecture] }
          : section,
    );
    setAndPersistSections(nextSections);
    const draftQuery = !id && draftId ? `?draft=${encodeURIComponent(draftId)}` : '';
    navigate(`/admin/courses/${routeCourseId}/sections/${sectionId}/lectures/${newLecture.id}/edit${draftQuery}`);
  };

  const removeLecture = (sectionId: string, lectureId: string) => {
    const section = sections.find((item) => item.id === sectionId);
    const lecture = section?.lectures.find((item) => item.id === lectureId);
    if (!section || !lecture) {
      return;
    }

    setDeleteTarget({
      type: 'lecture',
      sectionId,
      lectureId,
      title: lecture.title,
      message: `Delete "${lecture.title}" from "${section.title}"?`,
    });
  };

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    if (deleteTarget.type === 'section-group') {
      const nextSections = sections.filter((section) => !deleteTarget.sectionIds.includes(section.id));
      setAndPersistSections(nextSections);
      setDeleteTarget(null);
      return;
    }

    if (deleteTarget.type === 'subsection') {
      const nextSections = sections.filter((section) => section.id !== deleteTarget.sectionId);
      setAndPersistSections(nextSections);
      setDeleteTarget(null);
      return;
    }

    const nextSections = sections.map((section) =>
      section.id === deleteTarget.sectionId
        ? {
            ...section,
            lectures: section.lectures.filter((lecture) => lecture.id !== deleteTarget.lectureId),
          }
        : section,
    );
    setAndPersistSections(nextSections);
    setDeleteTarget(null);
  };

  const openLessonEditor = (sectionId: string, lectureId: string) => {
    const draftQuery = !id && draftId ? `?draft=${encodeURIComponent(draftId)}` : '';
    navigate(`/admin/courses/${routeCourseId}/sections/${sectionId}/lectures/${lectureId}/edit${draftQuery}`);
  };

  const getLectureIcon = (type: ContentType, className: string) => {
    if (type === 'Video') {
      return <Video className={className} />;
    }

    if (type === 'Quiz') {
      return <HelpCircle className={className} />;
    }

    return <FileText className={className} />;
  };

  useEffect(() => {
    setActiveStep(getStepFromQuery());
  }, [searchParams]);

  useEffect(() => {
    if (!id && !draftId) {
      setSections([]);
      return;
    }
    setSections(getCourseSectionsDraft(courseKey));
  }, [courseKey, draftId, id]);

  useEffect(() => {
    if (id || draftIdParam || !draftId) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set('draft', draftId);
    if (!next.get('step')) {
      next.set('step', '1');
    }
    setSearchParams(next, { replace: true });
  }, [draftId, draftIdParam, id, searchParams, setSearchParams]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const fetchCourse = async () => {
      try {
        const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/courses/${id}`);
        const payload = await response.json().catch(() => null);
        const payloadRecord =
          payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
        const course =
          payloadRecord?.course && typeof payloadRecord.course === 'object'
            ? (payloadRecord.course as Record<string, unknown>)
            : undefined;

        if (!response.ok || payloadRecord?.success !== true || !course) {
          return;
        }

        setCourseTitle(typeof course.title === 'string' ? course.title : '');
        setCourseSubtitle(typeof course.subtitle === 'string' ? course.subtitle : '');
        setCourseDescription(typeof course.description === 'string' ? course.description : '');
        setLanguage(typeof course.language === 'string' ? course.language : LANGUAGES[0]);
        setLevel(typeof course.level === 'string' ? course.level : LEVELS[0]);
        setCategory(typeof course.category === 'string' ? course.category : CATEGORIES[0]);
        const incomingCourseImage = sanitizePersistedAssetUrl(typeof course.image === 'string' ? course.image : '');
        const incomingPromoVideo = sanitizePersistedAssetUrl(typeof course.promoVideo === 'string' ? course.promoVideo : '');
        setCourseImage(incomingCourseImage);
        setPromoVideo(incomingPromoVideo);
        setCourseImageFileName(getAssetFileNameFromValue(incomingCourseImage));
        setPromoVideoFileName(getAssetFileNameFromValue(incomingPromoVideo));
        setCourseStatus(course.status === 'Published' ? 'Published' : 'Draft');
        setVisibility(course.visibility === 'Private' ? 'Private' : 'Public');
        setEnrollmentStatus(course.enrollmentStatus === 'Closed' ? 'Closed' : 'Open');
        setWelcomeMessage(typeof course.welcomeMessage === 'string' ? course.welcomeMessage : '');
        setReminderMessage(typeof course.reminderMessage === 'string' ? course.reminderMessage : '');
        setCongratulationsMessage(
          typeof course.congratulationsMessage === 'string' ? course.congratulationsMessage : '',
        );

        const targetStudents = Array.isArray(course.targetStudents)
          ? course.targetStudents.filter((item): item is string => typeof item === 'string')
          : [];
        setTargetStudentsInput(targetStudents.join('\n'));

        const apiSections = Array.isArray(course.sections)
          ? (course.sections as Section[])
          : [];
        const hasLocalDraft = hasStoredCourseSectionsDraft(courseKey);
        if (apiSections.length > 0 && !hasLocalDraft) {
          setAndPersistSections(apiSections);
        }
      } catch {
        // Keep local draft values if backend fetch fails.
      }
    };

    fetchCourse();
  }, [id]);

  const handleStepChange = (step: number) => {
    setActiveStep(step);
    const nextParams = new URLSearchParams(searchParams);
    if (step === 1) {
      nextParams.delete('step');
    } else {
      nextParams.set('step', String(step));
    }
    setSearchParams(nextParams, { replace: true });
  };

  const uploadCourseAsset = async (file: File, endpoint: '/api/admin/uploads/course-image' | '/api/admin/uploads/promo-video') => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${COURSE_API_BASE_URL}${endpoint}`, {
      method: 'POST',
      body: formData,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(extractApiMessage(payload) ?? 'Unable to upload file.');
    }

    const asset = parseUploadedAsset(payload);
    if (!asset) {
      throw new Error('Unexpected response from upload service.');
    }

    return asset;
  };

  const handleCourseImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setSaveError(null);
    setSaveMessage(null);

    if (!file.type.startsWith('image/')) {
      setSaveError('Course image must be an image file.');
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setSaveError('Course image must be 5 MB or smaller.');
      return;
    }

    setIsUploadingCourseImage(true);

    try {
      const asset = await uploadCourseAsset(file, '/api/admin/uploads/course-image');
      setCourseImage(asset.url);
      setCourseImageFileName(asset.fileName);
      setSaveMessage('Course image uploaded.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to upload course image.');
    } finally {
      setIsUploadingCourseImage(false);
    }
  };

  const handlePromoVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setSaveError(null);
    setSaveMessage(null);

    if (!file.type.startsWith('video/')) {
      setSaveError('Promotional video must be a video file.');
      return;
    }

    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      setSaveError('Promotional video must be 30 MB or smaller.');
      return;
    }

    setIsUploadingPromoVideo(true);

    try {
      const asset = await uploadCourseAsset(file, '/api/admin/uploads/promo-video');
      setPromoVideo(asset.url);
      setPromoVideoFileName(asset.fileName);
      setSaveMessage('Promotional video uploaded.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to upload promotional video.');
    } finally {
      setIsUploadingPromoVideo(false);
    }
  };

  const clearCourseImage = () => {
    setCourseImage('');
    setCourseImageFileName('');
  };

  const clearPromoVideo = () => {
    setPromoVideo('');
    setPromoVideoFileName('');
  };

  const generateAiCourseCopy = async () => {
    const title = courseTitle.trim();
    if (!title) {
      setAiError('Enter a course title first to generate content.');
      setAiMessage(null);
      return;
    }

    setAiError(null);
    setAiMessage(null);
    setIsGeneratingAi(true);

    try {
      const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/courses/generate-content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          language,
          level,
          category,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setAiError(extractApiMessage(payload) ?? 'Unable to generate content right now.');
        return;
      }

      const generatedContent = parseGeneratedCourseContent(payload);
      if (!generatedContent) {
        setAiError('Unexpected response from AI content service.');
        return;
      }

      setCourseDescription(generatedContent.description);
      if (generatedContent.learningOutcomes.length > 0) {
        setTargetStudentsInput(generatedContent.learningOutcomes.join('\n'));
      }
      setAiMessage(generatedContent.message || 'Generated course description and learning outcomes.');
    } catch {
      setAiError('Cannot reach the AI content service. Please try again.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const generateAiAutomatedMessages = async () => {
    const title = courseTitle.trim();
    if (!title) {
      setAiError('Enter a course title first to generate automated messages.');
      setAiMessage(null);
      return;
    }

    setAiError(null);
    setAiMessage(null);
    setIsGeneratingMessageAi(true);

    try {
      const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/courses/generate-automated-messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          language,
          level,
          category,
          description: courseDescription.trim(),
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setAiError(extractApiMessage(payload) ?? 'Unable to generate automated messages right now.');
        return;
      }

      const generatedMessages = parseGeneratedAutomatedMessages(payload);
      if (!generatedMessages) {
        setAiError('Unexpected response from AI automated messages service.');
        return;
      }

      setWelcomeMessage(generatedMessages.welcomeMessage);
      setReminderMessage(generatedMessages.reminderMessage);
      setCongratulationsMessage(generatedMessages.congratulationsMessage);
      setAiMessage(generatedMessages.message || 'Generated automated course messages.');
    } catch {
      setAiError('Cannot reach the AI content service. Please try again.');
    } finally {
      setIsGeneratingMessageAi(false);
    }
  };

  const getNormalizedTargetStudents = () =>
    targetStudentsInput
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

  const getNormalizedSections = () =>
    sections.map((section, sectionIndex) => ({
      ...section,
      title: section.title.trim() || `Section ${sectionIndex + 1}`,
      lectures: section.lectures.map((lecture, lectureIndex) => ({
        ...lecture,
        title: lecture.title.trim() || `Lecture ${lectureIndex + 1}`,
        duration: lecture.duration?.trim() || undefined,
        content: lecture.content ?? undefined,
        videoUrl: lecture.videoUrl?.trim() || undefined,
      })),
    }));

  const getPublishValidationMessage = () => {
    const normalizedSections = getNormalizedSections();
    const hasAnyLectures = normalizedSections.some((section) => section.lectures.length > 0);
    const hasSectionWithLessonAndQuiz = normalizedSections.some((section) => {
      if (section.lectures.length === 0) {
        return false;
      }
      const hasQuiz = section.lectures.some((lecture) => lecture.type === 'Quiz');
      const hasLesson = section.lectures.some((lecture) => lecture.type !== 'Quiz');
      return hasQuiz && hasLesson;
    });

    if (!hasAnyLectures) {
      return 'Add at least one section with lectures before publishing.';
    }

    if (!hasSectionWithLessonAndQuiz) {
      return 'Add a section that includes at least one lesson and one quiz before publishing.';
    }

    const missingMessages: string[] = [];
    if (!welcomeMessage.trim()) {
      missingMessages.push('welcome');
    }
    if (!reminderMessage.trim()) {
      missingMessages.push('reminder');
    }
    if (!congratulationsMessage.trim()) {
      missingMessages.push('congratulations');
    }

    if (missingMessages.length > 0) {
      return `Complete automated messages (${missingMessages.join(', ')}) before publishing.`;
    }

    return null;
  };

  const handlePreview = () => {
    const editorBasePath = id ? `/admin/courses/${id}` : '/admin/courses/new';
    const previewBackTo = searchParams.toString()
      ? `${editorBasePath}?${searchParams.toString()}`
      : editorBasePath;

    navigate(`/course/${id ?? 'preview'}`, {
      state: {
        previewCourse: {
          id: id ?? 'preview',
          title: courseTitle.trim() || 'Untitled Course',
          subtitle: courseSubtitle.trim() || 'Course subtitle preview',
          description: courseDescription.trim() || 'Course description preview.',
          language,
          level,
          category,
          image: sanitizePersistedAssetUrl(courseImage),
          promoVideo: sanitizePersistedAssetUrl(promoVideo) || undefined,
          targetStudents: getNormalizedTargetStudents(),
          sections: getNormalizedSections(),
          status: courseStatus,
          enrollmentStatus,
          visibility,
          welcomeMessage: welcomeMessage.trim(),
          reminderMessage: reminderMessage.trim(),
          congratulationsMessage: congratulationsMessage.trim(),
          studentsCount: 0,
          rating: 0,
          lastUpdated: new Date().toISOString().slice(0, 10),
        },
        previewBackTo,
      },
    });
  };

  const saveCourse = async (nextStatus: 'Draft' | 'Published' = courseStatus) => {
    const title = courseTitle.trim();
    if (!title) {
      return {
        success: false,
        message: 'Course title is required.',
      };
    }

    const targetStudents = getNormalizedTargetStudents();
    const normalizedSections = getNormalizedSections();
    const normalizedCourseImage = sanitizePersistedAssetUrl(courseImage);
    const normalizedPromoVideo = sanitizePersistedAssetUrl(promoVideo);

    const payload = {
      title,
      subtitle: courseSubtitle.trim(),
      description: courseDescription.trim(),
      language,
      level,
      category,
      image: normalizedCourseImage,
      promoVideo: normalizedPromoVideo || undefined,
      targetStudents,
      status: nextStatus,
      enrollmentStatus,
      visibility,
      welcomeMessage: welcomeMessage.trim(),
      reminderMessage: reminderMessage.trim(),
      congratulationsMessage: congratulationsMessage.trim(),
      sections: normalizedSections,
    };

    const endpoint = id
      ? `${COURSE_API_BASE_URL}/api/admin/courses/${id}`
      : `${COURSE_API_BASE_URL}/api/admin/courses`;
    const method = id ? 'PUT' : 'POST';

    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        success: false,
        message: extractApiMessage(body) ?? 'Unable to save course.',
      };
    }

    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : undefined;
    const course = record?.course;
    if (
      !course ||
      typeof course !== 'object' ||
      typeof (course as Record<string, unknown>).id !== 'string'
    ) {
      return {
        success: false,
        message: 'Unexpected response from course service.',
      };
    }

    return {
      success: true,
      courseId: (course as Record<string, string>).id,
      status: ((course as Record<string, unknown>).status === 'Published' ? 'Published' : 'Draft') as 'Draft' | 'Published',
    };
  };

  const handleSaveAndContinue = async () => {
    setSaveError(null);
    setSaveMessage(null);
    setIsSaving(true);

    try {
      const result = await saveCourse(courseStatus);
      if (!result.success || !result.courseId) {
        setSaveError(result.message ?? 'Unable to save course.');
        return;
      }

      saveCourseSectionsDraft(result.courseId, sections);
      setCourseStatus(result.status ?? courseStatus);
      const nextStep = Math.min(activeStep + 1, 4);

      if (!id) {
        const query = nextStep === 1 ? '' : `?step=${nextStep}`;
        navigate(`/admin/courses/${result.courseId}${query}`);
        return;
      }

      handleStepChange(nextStep);
      setSaveMessage('Course saved.');
    } catch {
      setSaveError('Cannot reach the course service. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    setSaveError(null);
    setSaveMessage(null);
    setIsSaving(true);

    try {
      const result = await saveCourse('Draft');
      if (!result.success || !result.courseId) {
        setSaveError(result.message ?? 'Unable to save draft.');
        return;
      }

      saveCourseSectionsDraft(result.courseId, sections);
      setCourseStatus('Draft');
      navigate('/admin/courses', { state: { notice: 'Draft saved.' } });
      return;
    } catch {
      setSaveError('Cannot reach the course service. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const openPublishConfirm = () => {
    if (courseStatus === 'Published') {
      handlePublish();
      return;
    }

    setSaveError(null);
    const validationMessage = getPublishValidationMessage();
    if (validationMessage) {
      setSaveError(validationMessage);
      return;
    }

    setIsPublishConfirmOpen(true);
  };

  const closePublishConfirm = () => {
    if (isPublishing) {
      return;
    }
    setIsPublishConfirmOpen(false);
  };

  const confirmPublish = () => {
    setIsPublishConfirmOpen(false);
    handlePublish();
  };

  const handlePublish = async () => {
    setSaveError(null);
    setSaveMessage(null);
    setIsPublishing(true);

    try {
      const result = await saveCourse('Published');
      if (!result.success || !result.courseId) {
        setSaveError(result.message ?? 'Unable to publish course.');
        return;
      }

      saveCourseSectionsDraft(result.courseId, sections);
      setCourseStatus('Published');

      const editorBasePath = `/admin/courses/${result.courseId}`;
      const query = activeStep === 1 ? '' : `?step=${activeStep}`;
      const previewBackTo = `${editorBasePath}${query}`;
      navigate(`/course/${result.courseId}`, { state: { previewBackTo } });
      return;
    } catch {
      setSaveError('Cannot reach the course service. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };
  const isUploadingAsset = isUploadingCourseImage || isUploadingPromoVideo;
  const isPublishedCourse = courseStatus === 'Published';

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{id ? 'Edit Course' : 'Create New Course'}</h1>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            {courseStatus === 'Published' ? 'Published' : 'Draft Saved'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handlePreview}
          className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={handleSaveAndContinue}
          disabled={isSaving || isPublishing || isUploadingAsset}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-200 active:scale-95"
        >
          {isSaving ? 'Saving...' : 'Save and Continue'}
        </button>
        {!isPublishedCourse ? (
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving || isPublishing || isUploadingAsset}
            className="px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            Save Draft
          </button>
        ) : null}
        <button
          type="button"
          onClick={openPublishConfirm}
          disabled={isSaving || isPublishing || isUploadingAsset}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-2 font-semibold text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <CheckCircle2 className="h-4 w-4" />
          {isPublishing ? 'Publishing...' : courseStatus === 'Published' ? 'Update Course' : 'Publish'}
        </button>
      </div>
      </header>
      <ConfirmDialog
        isOpen={isPublishConfirmOpen}
        badge="Confirm Publish"
        title={`Publish ${courseTitle.trim() ? `"${courseTitle.trim()}"` : 'this course'}?`}
        description="Students will be able to enroll and access the course immediately."
        confirmLabel="Publish Course"
        confirmingLabel="Publishing..."
        cancelLabel="Cancel"
        tone="primary"
        isConfirming={isPublishing}
        onCancel={closePublishConfirm}
        onConfirm={confirmPublish}
      />
      {saveError ? <p className="mb-6 text-sm font-medium text-red-600">{saveError}</p> : null}
      {saveMessage ? <p className="mb-6 text-sm font-medium text-emerald-600">{saveMessage}</p> : null}
      {aiError ? <p className="mb-6 text-sm font-medium text-red-600">{aiError}</p> : null}
      {aiMessage ? <p className="mb-6 text-sm font-medium text-indigo-600">{aiMessage}</p> : null}

      <nav className="flex items-center justify-between border-b border-slate-200 mb-8">
        {steps.map((step) => (
          <button
            key={step.id}
            onClick={() => handleStepChange(step.id)}
            className={cn(
              "px-4 py-4 text-sm font-semibold border-b-2 transition-all",
              activeStep === step.id 
                ? "border-indigo-600 text-indigo-600" 
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            {step.id}. {step.label}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1 space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Course Builder</h3>
            <nav className="space-y-1">
              {['Landing Page Info', 'Automated Messages', 'Course Image', 'Promotional Video'].map((item) => (
                <button key={item} className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                  {item}
                </button>
              ))}
            </nav>
          </div>
          <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
            <h4 className="text-sm font-bold text-indigo-900 mb-2">Tips for success</h4>
            <p className="text-xs text-indigo-700 leading-relaxed">
              Your course landing page is crucial for conversions. Make sure to use keywords and a compelling title.
            </p>
          </div>
        </aside>

        <main className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {activeStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-8"
              >
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Course Landing Page</h2>
                  <p className="text-slate-500">Your landing page is how students find and decide to buy your course.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Course Title</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Master React and Tailwind CSS from scratch" 
                      value={courseTitle}
                      onChange={(event) => setCourseTitle(event.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                    />
                    <p className="text-xs text-slate-400">Your title should be a mix of attention-grabbing and informative. (Max 60 characters)</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Course Subtitle</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Build real-world projects and master modern frontend development" 
                      value={courseSubtitle}
                      onChange={(event) => setCourseSubtitle(event.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                    />
                    <p className="text-xs text-slate-400">Use 1 or 2 sentences to describe the primary goal of the course.</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-bold text-slate-700">Course Description</label>
                      <button
                        type="button"
                        onClick={generateAiCourseCopy}
                        disabled={isGeneratingAi}
                        className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {isGeneratingAi ? 'Generating...' : 'Generate with AI'}
                      </button>
                    </div>
                    <textarea
                      value={courseDescription}
                      onChange={(event) => setCourseDescription(event.target.value)}
                      placeholder="Describe what students will learn in your course..."
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none min-h-[180px] transition-all"
                    />
                    <p className="text-xs text-slate-400">Provide a clear overview of outcomes, key topics, and who this course is for.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">What You'll Learn</label>
                    <textarea
                      value={targetStudentsInput}
                      onChange={(event) => setTargetStudentsInput(event.target.value)}
                      placeholder="Add one learning outcome per line. Example: Build and deploy a full project from scratch."
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none min-h-[150px] transition-all"
                    />
                    <p className="text-xs text-slate-400">This section is auto-filled when you click Generate with AI above.</p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Language</label>
                      <select
                        value={language}
                        onChange={(event) => setLanguage(event.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      >
                        {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Level</label>
                      <select
                        value={level}
                        onChange={(event) => setLevel(event.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      >
                        {LEVELS.map(l => <option key={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Category</label>
                      <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      >
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Course Image</label>
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-slate-600 truncate">
                            {courseImageFileName || (courseImage ? 'Uploaded image ready' : 'No image uploaded')}
                          </p>
                          {courseImage ? (
                            <button
                              type="button"
                              onClick={clearCourseImage}
                              disabled={isUploadingCourseImage}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <X className="h-3 w-3" />
                              Remove
                            </button>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3">
                          <label
                            className={cn(
                              'inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800',
                              isUploadingCourseImage ? 'cursor-not-allowed opacity-70 hover:bg-slate-900' : '',
                            )}
                          >
                            <Upload className="h-4 w-4" />
                            {isUploadingCourseImage ? 'Uploading...' : 'Upload Image'}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleCourseImageUpload}
                              disabled={isUploadingCourseImage}
                              className="hidden"
                            />
                          </label>
                          <p className="text-xs text-slate-500">PNG, JPG, WEBP up to 5 MB.</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Promotional Video</label>
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-slate-600 truncate">
                            {promoVideoFileName || (promoVideo ? 'Uploaded video ready' : 'No video uploaded')}
                          </p>
                          {promoVideo ? (
                            <button
                              type="button"
                              onClick={clearPromoVideo}
                              disabled={isUploadingPromoVideo}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <X className="h-3 w-3" />
                              Remove
                            </button>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3">
                          <label
                            className={cn(
                              'inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800',
                              isUploadingPromoVideo ? 'cursor-not-allowed opacity-70 hover:bg-slate-900' : '',
                            )}
                          >
                            <Upload className="h-4 w-4" />
                            {isUploadingPromoVideo ? 'Uploading...' : 'Upload Video'}
                            <input
                              type="file"
                              accept="video/*"
                              onChange={handlePromoVideoUpload}
                              disabled={isUploadingPromoVideo}
                              className="hidden"
                            />
                          </label>
                          <p className="text-xs text-slate-500">MP4/WEBM/MOV up to 30 MB.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-1">Curriculum</h2>
                    <p className="text-slate-500">Start putting together your course by creating sections, subsections, and lessons.</p>
                  </div>
                  <button 
                    onClick={addSectionGroup}
                    className="bg-slate-900 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-800 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Add Section
                  </button>
                </div>

                {sectionGroups.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
                    Add a section to start building your curriculum.
                  </div>
                ) : (
                  sectionGroups.map((group, sIdx) => {
                    const sectionTitle = group.title.trim() || `Section ${sIdx + 1}`;
                    return (
                      <div key={group.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <GripVertical className="w-4 h-4 text-slate-300" />
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Section {sIdx + 1}:</span>
                            <input
                              type="text"
                              value={group.title}
                              onChange={(event) => updateSectionGroupTitle(group, event.target.value)}
                              placeholder="Section title"
                              className="font-bold text-slate-900 bg-transparent border-none focus:ring-0 p-0"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSectionGroup(group)}
                            className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                            aria-label={`Delete ${sectionTitle}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="p-4 space-y-4">
                          {group.subsections.map((subsection, subIdx) => (
                            <div key={subsection.section.id} className="rounded-xl border border-slate-200 bg-white">
                              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subsection {subIdx + 1}:</span>
                                  <input
                                    type="text"
                                    value={subsection.title}
                                    onChange={(event) =>
                                      updateSubsectionTitle(sectionTitle, subsection.section.id, event.target.value)
                                    }
                                    placeholder="Subsection title"
                                    className="font-semibold text-slate-900 bg-transparent border-none focus:ring-0 p-0"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeSubsection(subsection.section.id)}
                                  className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                                  aria-label={`Delete ${subsection.title}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              <div className="p-4 space-y-3">
                                {subsection.section.lectures.map((lecture, lIdx) => (
                                  <div key={lecture.id} className="flex items-center gap-4 p-4 border border-slate-100 rounded-xl hover:border-indigo-200 transition-all group">
                                    <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400" />
                                    <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                                      {getLectureIcon(lecture.type, 'w-4 h-4 text-indigo-600')}
                                    </div>
                                    <div className="flex-1">
                                      <h4 className="text-sm font-bold text-slate-900">{lIdx + 1}. {lecture.title}</h4>
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{lecture.type}</p>
                                      {lecture.duration && <span className="text-xs text-slate-400">{lecture.duration}</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openLessonEditor(subsection.section.id, lecture.id)}
                                        className="px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                      >
                                        Edit Content
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeLecture(subsection.section.id, lecture.id)}
                                        className="inline-flex items-center justify-center rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                        aria-label={`Delete ${lecture.title}`}
                                        title="Delete lesson"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <button
                                    type="button"
                                    onClick={() => addContentItem(subsection.section.id, 'Video')}
                                    className="py-3 border-2 border-dashed border-slate-100 rounded-xl text-sm font-bold text-slate-400 hover:border-indigo-200 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                                  >
                                    <Video className="w-4 h-4" />
                                    Add Lecture
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => addContentItem(subsection.section.id, 'Quiz')}
                                    className="py-3 border-2 border-dashed border-slate-100 rounded-xl text-sm font-bold text-slate-400 hover:border-indigo-200 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                                  >
                                    <HelpCircle className="w-4 h-4" />
                                    Add Quiz
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => addContentItem(subsection.section.id, 'Resource')}
                                    className="py-3 border-2 border-dashed border-slate-100 rounded-xl text-sm font-bold text-slate-400 hover:border-indigo-200 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                                  >
                                    <FileText className="w-4 h-4" />
                                    Add Resource
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={() => addSubsection(sectionTitle)}
                            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm font-bold text-slate-500 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                          >
                            <Plus className="w-4 h-4" />
                            Add Subsection
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </motion.div>
            )}

            {activeStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-8"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Automated Messages</h2>
                    <p className="text-slate-500">Configure the automated messages sent to students during their learning journey.</p>
                  </div>
                  <button
                    type="button"
                    onClick={generateAiAutomatedMessages}
                    disabled={isGeneratingMessageAi}
                    className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {isGeneratingMessageAi ? 'Generating...' : 'Generate with AI'}
                  </button>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Welcome Message</label>
                    <p className="text-[11px] text-slate-500">Sent when a student first starts learning this course.</p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1">
                        <button type="button" className="w-7 h-7 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className="w-7 h-7 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
                          <Italic className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className="w-7 h-7 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
                          <List className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <textarea
                        value={welcomeMessage}
                        onChange={(event) => setWelcomeMessage(event.target.value)}
                        placeholder="e.g. Welcome to the course! I'm excited to help you get started."
                        className="w-full px-4 py-3 outline-none min-h-[130px] text-sm text-slate-700"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Reminder Message</label>
                    <p className="text-[11px] text-slate-500">Sent while students are in progress to encourage continuation.</p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1">
                        <button type="button" className="w-7 h-7 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className="w-7 h-7 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
                          <Italic className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className="w-7 h-7 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
                          <List className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <textarea
                        value={reminderMessage}
                        onChange={(event) => setReminderMessage(event.target.value)}
                        placeholder="e.g. You're doing great. Keep going and complete your next lesson today."
                        className="w-full px-4 py-3 outline-none min-h-[130px] text-sm text-slate-700"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Congratulations Message</label>
                    <p className="text-[11px] text-slate-500">Sent when a student completes every lesson in the course.</p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1">
                        <button type="button" className="w-7 h-7 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className="w-7 h-7 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
                          <Italic className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className="w-7 h-7 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
                          <List className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <textarea
                        value={congratulationsMessage}
                        onChange={(event) => setCongratulationsMessage(event.target.value)}
                        placeholder="e.g. Congratulations on completing the course. You did an excellent job!"
                        className="w-full px-4 py-3 outline-none min-h-[130px] text-sm text-slate-700"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-8"
              >
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Settings</h2>
                  <p className="text-slate-500">Manage visibility and enrollment settings.</p>
                </div>
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div>
                      <h4 className="font-bold text-slate-900">Course Visibility</h4>
                      <p className="text-xs text-slate-500">Public courses are searchable by everyone.</p>
                    </div>
                    <div className="flex bg-white p-1 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setVisibility('Public')}
                        className={cn(
                          'px-3 py-1.5 text-xs font-bold rounded-md',
                          visibility === 'Public' ? 'bg-indigo-600 text-white' : 'text-slate-600',
                        )}
                      >
                        Public
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisibility('Private')}
                        className={cn(
                          'px-3 py-1.5 text-xs font-bold rounded-md',
                          visibility === 'Private' ? 'bg-indigo-600 text-white' : 'text-slate-600',
                        )}
                      >
                        Private
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div>
                      <h4 className="font-bold text-slate-900">Enrollment Status</h4>
                      <p className="text-xs text-slate-500">Open for new students to join.</p>
                    </div>
                    <div className="flex bg-white p-1 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setEnrollmentStatus('Open')}
                        className={cn(
                          'px-3 py-1.5 text-xs font-bold rounded-md',
                          enrollmentStatus === 'Open' ? 'bg-emerald-600 text-white' : 'text-slate-600',
                        )}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => setEnrollmentStatus('Closed')}
                        className={cn(
                          'px-3 py-1.5 text-xs font-bold rounded-md',
                          enrollmentStatus === 'Closed' ? 'bg-emerald-600 text-white' : 'text-slate-600',
                        )}
                      >
                        Closed
                      </button>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
      <AnimatePresence>
        {deleteTarget ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            >
              <div className="mb-5 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-red-500">Confirm Delete</p>
                <h3 className="text-xl font-bold text-slate-900">{deleteTarget.title}</h3>
                <p className="text-sm leading-6 text-slate-500">{deleteTarget.message}</p>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDeleteDialog}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

const DollarSign = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
);
