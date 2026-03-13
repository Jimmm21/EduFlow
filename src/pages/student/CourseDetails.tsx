import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import { Star, Globe, Users, Calendar, Check, ChevronDown, PlayCircle, ArrowLeft, Video, FileText, HelpCircle, Download } from 'lucide-react';
import type { Course, Section } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { enrollInCourse, fetchPublicCourse } from '../../lib/courseApi';

type PreviewLocationState = {
  previewCourse?: Course;
  previewBackTo?: string;
  previewBackLabel?: string;
};

type DescriptionBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

const isRenderableAssetUrl = (value: string | undefined) => {
  if (!value) {
    return false;
  }

  if (value.startsWith('uploaded://')) {
    return false;
  }

  return /^(https?:\/\/|data:|blob:|\/)/i.test(value);
};

const parseDurationToSeconds = (duration: string | undefined) => {
  if (!duration) {
    return 0;
  }

  const parts = duration.split(':').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  }

  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }

  return 0;
};

const formatSecondsAsDuration = (seconds: number) => {
  if (seconds <= 0) {
    return '0m';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(1, minutes)}m`;
};

const getSectionDuration = (section: Section) =>
  section.lectures.reduce((total, lecture) => total + parseDurationToSeconds(lecture.duration), 0);

const getLectureIcon = (type: Section['lectures'][number]['type']) => {
  if (type === 'Video') {
    return Video;
  }

  if (type === 'Quiz') {
    return HelpCircle;
  }

  if (type === 'Resource') {
    return Download;
  }

  return FileText;
};

const parseDescriptionBlocks = (description: string): DescriptionBlock[] => {
  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const blocks: DescriptionBlock[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      blocks.push({ type: 'list', items: currentList });
      currentList = [];
    }
  };

  lines.forEach((line) => {
    if (line.startsWith('- ')) {
      currentList.push(line.slice(2).trim());
      return;
    }

    flushList();
    blocks.push({ type: 'paragraph', text: line });
  });

  flushList();
  return blocks;
};

export const CourseDetails = () => {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const locationState = (location.state as PreviewLocationState | null) ?? null;
  const previewCourse = locationState?.previewCourse ?? null;
  const previewBackTo = locationState?.previewBackTo ?? null;
  const previewBackLabel = locationState?.previewBackLabel ?? null;
  const [course, setCourse] = useState<Course | null>(previewCourse);
  const [isLoading, setIsLoading] = useState(!previewCourse);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollMessage, setEnrollMessage] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  useEffect(() => {
    if (previewCourse) {
      setCourse(previewCourse);
      setIsLoading(false);
      return;
    }

    if (!id) {
      setCourse(null);
      setIsLoading(false);
      return;
    }

    const fetchCourse = async () => {
      try {
        const fetchedCourse = await fetchPublicCourse(
          id,
          user?.role === 'Student' ? user.id : undefined,
        );
        setCourse(fetchedCourse);
        return;
      } catch {
        // Keep course unset on error.
      }
      setCourse(null);
    };

    fetchCourse().finally(() => setIsLoading(false));
  }, [id, previewCourse, user]);

  useEffect(() => {
    setExpandedSections(course?.sections[0] ? [course.sections[0].id] : []);
  }, [course]);

  const totalLectureCount = useMemo(
    () => course?.sections.reduce((total, section) => total + section.lectures.length, 0) ?? 0,
    [course],
  );
  const totalDurationSeconds = useMemo(
    () =>
      course?.sections.reduce((total, section) => total + getSectionDuration(section), 0) ?? 0,
    [course],
  );
  const learningOutcomes = useMemo(
    () => (course?.targetStudents.length ? course.targetStudents : []),
    [course],
  );
  const descriptionBlocks = useMemo(
    () => parseDescriptionBlocks(course?.description ?? ''),
    [course],
  );
  const renderablePromoVideo = useMemo(
    () => (isRenderableAssetUrl(course?.promoVideo) ? course?.promoVideo : undefined),
    [course?.promoVideo],
  );

  const toggleSection = (sectionId: string) => {
    setExpandedSections((currentSections) =>
      currentSections.includes(sectionId)
        ? currentSections.filter((currentSectionId) => currentSectionId !== sectionId)
        : [...currentSections, sectionId],
    );
  };

  const handleEnroll = async () => {
    if (!course || !user || user.role !== 'Student') {
      return;
    }

    setIsEnrolling(true);
    setEnrollError(null);
    setEnrollMessage(null);

    try {
      const result = await enrollInCourse(course.id, user.id);
      setCourse(result.course);
      setEnrollMessage(result.message ?? 'Enrollment request submitted. Waiting for admin approval.');
    } catch (error) {
      setEnrollError(error instanceof Error ? error.message : 'Unable to enroll in this course.');
    } finally {
      setIsEnrolling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">
          Loading course preview...
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="text-2xl font-bold text-slate-900">Course not found</h1>
          <p className="text-slate-500">The preview could not be loaded from the current course data.</p>
          <Link
            to={previewBackTo ?? '/browse'}
            className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      {previewBackTo ? (
        <div className="border-b border-slate-200 bg-amber-50">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Preview Mode</p>
              <p className="text-sm text-slate-600">This page is showing your current draft, including unsaved changes.</p>
            </div>
            <Link
              to={previewBackTo}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              <ArrowLeft className="h-4 w-4" />
              {previewBackLabel || 'Back to Editor'}
            </Link>
          </div>
        </div>
      ) : null}
      <section className="bg-slate-900 py-12 text-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <nav className="flex items-center gap-2 text-sm font-medium text-indigo-400">
              {previewBackTo ? (
                <span>{course.category}</span>
              ) : (
                <Link to="/browse" className="hover:underline">{course.category}</Link>
              )}
              <span className="text-slate-600">/</span>
              <span>{course.level}</span>
            </nav>

            <h1 className="text-4xl font-bold leading-tight">{course.title}</h1>
            <p className="text-xl text-slate-300">{course.subtitle || 'No subtitle yet.'}</p>

            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div className="flex items-center gap-1 font-bold text-amber-400">
                <span>{course.rating > 0 ? course.rating.toFixed(1) : 'New'}</span>
                <div className="flex">
                  {[...Array(5)].map((_, index) => (
                    <Star
                      key={index}
                      className={`h-4 w-4 ${index < Math.floor(course.rating) ? 'fill-current' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <div className="text-slate-300">
                <span className="font-bold text-white">{course.studentsCount.toLocaleString()}</span> students
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Last updated {course.lastUpdated}</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                <span>{course.language}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>{course.sections.length} sections</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="relative aspect-video">
                {renderablePromoVideo ? (
                  <video
                    src={renderablePromoVideo}
                    controls
                    preload="metadata"
                    className="h-full w-full bg-black object-cover"
                    poster={isRenderableAssetUrl(course.image) ? course.image : undefined}
                  />
                ) : isRenderableAssetUrl(course.image) ? (
                  <img src={course.image} alt={course.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 via-slate-700 to-indigo-700 p-6 text-center">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.25em] text-indigo-200">{course.category}</p>
                      <p className="mt-3 text-2xl font-bold text-white">{course.title}</p>
                    </div>
                  </div>
                )}
                {!renderablePromoVideo ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35">
                    <PlayCircle className="h-16 w-16 text-white" />
                    <span className="font-bold text-white">Preview this course</span>
                  </div>
                ) : null}
              </div>

              <div className="space-y-4 p-6">
                {previewBackTo ? (
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-xl bg-slate-300 py-4 text-lg font-bold text-white"
                  >
                    Preview Mode
                  </button>
                ) : user?.role === 'Student' && course.isEnrolled ? (
                  <Link
                    to={`/course/${course.id}/learn`}
                    className="block w-full rounded-xl bg-emerald-600 py-4 text-center text-lg font-bold text-white transition-all shadow-lg shadow-emerald-200 hover:bg-emerald-700"
                  >
                    Start Learning
                  </Link>
                ) : user?.role === 'Student' && course.hasPendingEnrollmentRequest ? (
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-xl bg-amber-500 py-4 text-lg font-bold text-white"
                  >
                    Awaiting Admin Approval
                  </button>
                ) : user?.role === 'Student' ? (
                  <button
                    type="button"
                    onClick={handleEnroll}
                    disabled={isEnrolling || course.enrollmentStatus !== 'Open'}
                    className="w-full rounded-xl bg-indigo-600 py-4 text-lg font-bold text-white transition-all shadow-lg shadow-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {course.enrollmentStatus === 'Closed'
                      ? 'Enrollment Closed'
                      : isEnrolling
                        ? 'Submitting Request...'
                        : 'Request Enrollment'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-xl bg-slate-300 py-4 text-lg font-bold text-white"
                  >
                    Admin View
                  </button>
                )}
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-500">
                    {previewBackTo
                      ? 'This is a draft preview only.'
                      : course.isEnrolled
                        ? 'You are enrolled in this course.'
                        : course.hasPendingEnrollmentRequest
                          ? 'Your request is pending admin approval.'
                          : 'Request enrollment to access this course.'}
                  </p>
                </div>
                {enrollError ? <p className="text-sm font-medium text-red-600">{enrollError}</p> : null}
                {enrollMessage ? <p className="text-sm font-medium text-emerald-600">{enrollMessage}</p> : null}
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <h4 className="text-sm font-bold text-slate-900">This course includes:</h4>
                  <ul className="space-y-2">
                    {[
                      `${course.sections.length} section${course.sections.length === 1 ? '' : 's'}`,
                      `${totalLectureCount} lecture${totalLectureCount === 1 ? '' : 's'}`,
                      `${formatSecondsAsDuration(totalDurationSeconds)} total content`,
                      `${course.level} level`,
                      `${course.visibility} visibility`,
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-3 text-sm text-slate-600">
                        <Check className="h-4 w-4 text-slate-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 py-16 lg:grid-cols-3">
        <div className="space-y-12 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-8">
            <h2 className="mb-6 text-2xl font-bold text-slate-900">What you'll learn</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {learningOutcomes.length === 0 ? (
                <p className="text-sm text-slate-500">Learning outcomes will appear here once they are added.</p>
              ) : (
                learningOutcomes.map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <span>{item}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold text-slate-900">Course content</h2>
              {course.sections.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSections(
                      expandedSections.length === course.sections.length
                        ? []
                        : course.sections.map((section) => section.id),
                    )
                  }
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  {expandedSections.length === course.sections.length ? 'Collapse all' : 'Expand all'}
                </button>
              ) : null}
            </div>
            <p className="text-sm text-slate-500">
              {course.sections.length} section{course.sections.length === 1 ? '' : 's'} • {totalLectureCount} lecture{totalLectureCount === 1 ? '' : 's'} • {formatSecondsAsDuration(totalDurationSeconds)} total length
            </p>

            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
              {course.sections.length === 0 ? (
                <div className="p-6 text-center text-slate-500">No sections added yet.</div>
              ) : (
                course.sections.map((section) => {
                  const isExpanded = expandedSections.includes(section.id);

                  return (
                  <div key={section.id} className="bg-white">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        <span className="font-bold text-slate-900">{section.title}</span>
                      </div>
                      <span className="text-sm text-slate-500">
                        {section.lectures.length} lecture{section.lectures.length === 1 ? '' : 's'} • {formatSecondsAsDuration(getSectionDuration(section))}
                      </span>
                    </button>
                    {isExpanded ? (
                      <div className="border-t border-slate-100 bg-slate-50/60">
                        {section.lectures.length === 0 ? (
                          <div className="px-6 py-4 text-sm text-slate-500">No lessons added to this section yet.</div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {section.lectures.map((lecture, index) => {
                              const LectureIcon = getLectureIcon(lecture.type);

                              return (
                                <div key={lecture.id} className="flex items-center justify-between gap-4 px-6 py-4">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
                                      <LectureIcon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-slate-900">
                                        {index + 1}. {lecture.title}
                                      </p>
                                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                                        {lecture.type}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="shrink-0 text-sm text-slate-500">
                                    {lecture.duration?.trim() || '--:--'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">Description</h2>
            <div className="space-y-4 text-sm leading-relaxed text-slate-600">
              {descriptionBlocks.length === 0 ? (
                <p>No course description yet.</p>
              ) : (
                descriptionBlocks.map((block, index) =>
                  block.type === 'paragraph' ? (
                    <p key={`paragraph-${index}`}>{block.text}</p>
                  ) : (
                    <ul key={`list-${index}`} className="list-disc space-y-2 pl-5">
                      {block.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ),
                )
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
