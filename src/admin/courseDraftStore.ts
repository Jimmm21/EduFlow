import type { Lecture, Section } from '../types';

const STORAGE_PREFIX = 'eduflow.course-draft.sections';

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const storageKeyForCourse = (courseId: string) => `${STORAGE_PREFIX}.${courseId}`;

const isNewCourseKey = (courseId: string) => courseId === 'new' || courseId.startsWith('new:');

const fallbackSectionsForCourse = (courseId: string): Section[] => {
  return isNewCourseKey(courseId) ? [] : [];
};

export const getCourseSectionsDraft = (courseId: string): Section[] => {
  const fallback = deepClone(fallbackSectionsForCourse(courseId));
  if (!canUseStorage()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(storageKeyForCourse(courseId));
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return fallback;
    }

    return parsed as Section[];
  } catch {
    return fallback;
  }
};

export const saveCourseSectionsDraft = (courseId: string, sections: Section[]) => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(storageKeyForCourse(courseId), JSON.stringify(sections));
};

export const hasStoredCourseSectionsDraft = (courseId: string): boolean => {
  if (!canUseStorage()) {
    return false;
  }

  return window.localStorage.getItem(storageKeyForCourse(courseId)) !== null;
};

export const findLectureInSections = (
  sections: Section[],
  sectionId: string,
  lectureId: string,
): { section: Section; lecture: Lecture } | null => {
  const section = sections.find((item) => item.id === sectionId);
  if (!section) {
    return null;
  }

  const lecture = section.lectures.find((item) => item.id === lectureId);
  if (!lecture) {
    return null;
  }

  return { section, lecture };
};
