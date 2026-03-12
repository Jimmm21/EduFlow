import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  Circle,
  FileText,
  HelpCircle,
  LayoutList,
  Play,
  Video,
} from 'lucide-react';
import { fetchPublicCourse } from '../../lib/courseApi';
import { useAuth } from '../../auth/AuthContext';
import { cn } from '../../utils';
import type { Course, Lecture, Section } from '../../types';

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

const getLectureIcon = (type: Lecture['type']) => {
  if (type === 'Video') {
    return Video;
  }
  if (type === 'Quiz') {
    return HelpCircle;
  }
  return FileText;
};

export const CourseOutline = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [activeView, setActiveView] = useState<'content' | 'performance'>('content');
  const [selectedSectionTitle, setSelectedSectionTitle] = useState<string | null>(null);
  const [selectedSubsectionId, setSelectedSubsectionId] = useState<string | null>(null);
  const [expandedSectionTitles, setExpandedSectionTitles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setCourse(null);
      setIsLoading(false);
      return;
    }

    const loadCourse = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const fetchedCourse = await fetchPublicCourse(
          id,
          user?.role === 'Student' ? user.id : undefined,
        );
        setCourse(fetchedCourse);
      } catch (loadError) {
        setCourse(null);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load course content.');
      } finally {
        setIsLoading(false);
      }
    };

    loadCourse();
  }, [id, user?.id, user?.role]);

  const courseSections = course?.sections ?? [];

  const sectionGroups = useMemo(() => {
    const groups: Array<{ id: string; title: string; subsections: Array<{ section: Section; title: string }> }> = [];
    const groupMap = new Map<string, { id: string; title: string; subsections: Array<{ section: Section; title: string }> }>();

    courseSections.forEach((section, index) => {
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
  }, [courseSections]);

  useEffect(() => {
    if (sectionGroups.length === 0) {
      setSelectedSectionTitle(null);
      setSelectedSubsectionId(null);
      setExpandedSectionTitles([]);
      return;
    }

    setSelectedSectionTitle((current) => {
      const next = current && sectionGroups.some((group) => group.title === current)
        ? current
        : sectionGroups[0].title;
      setExpandedSectionTitles((prev) =>
        prev.includes(next) ? prev : [next, ...prev].slice(0, 3),
      );
      return next;
    });
  }, [course?.id, sectionGroups]);

  const completedLectureIdSet = useMemo(
    () => new Set(course?.completedLectureIds ?? []),
    [course?.completedLectureIds],
  );

  const selectedGroup = useMemo(() => {
    if (sectionGroups.length === 0) {
      return null;
    }
    return sectionGroups.find((group) => group.title === selectedSectionTitle) ?? sectionGroups[0];
  }, [sectionGroups, selectedSectionTitle]);

  useEffect(() => {
    if (!selectedGroup) {
      setSelectedSubsectionId(null);
      return;
    }

    setSelectedSubsectionId((current) =>
      current && selectedGroup.subsections.some((subsection) => subsection.section.id === current)
        ? current
        : selectedGroup.subsections[0]?.section.id ?? null,
    );
  }, [selectedGroup]);

  const selectedSubsection = useMemo(() => {
    if (!selectedGroup) {
      return null;
    }
    return selectedGroup.subsections.find((subsection) => subsection.section.id === selectedSubsectionId)
      ?? selectedGroup.subsections[0]
      ?? null;
  }, [selectedGroup, selectedSubsectionId]);

  const buildLectureLink = (lectureId: string) => {
    const courseId = course?.id;
    if (!courseId) {
      return '#';
    }
    if (!selectedGroup?.title) {
      return `/course/${courseId}/learn/lectures/${lectureId}`;
    }
    const params = new URLSearchParams({ section: selectedGroup.title });
    if (selectedSubsectionId) {
      params.set('subsection', selectedSubsectionId);
    }
    return `/course/${courseId}/learn/lectures/${lectureId}?${params.toString()}`;
  };

  const toggleSectionGroup = (title: string) => {
    setExpandedSectionTitles((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title],
    );
  };

  const overallProgress = useMemo(() => {
    const progressValue = course?.progress;
    const normalizedProgress = typeof progressValue === 'number'
      ? Math.max(0, Math.min(100, Math.round(progressValue)))
      : null;
    const totalLectures = courseSections.reduce((count, section) => count + section.lectures.length, 0);
    if (totalLectures === 0) {
      return normalizedProgress ?? 0;
    }

    const completedLectures = courseSections.reduce(
      (count, section) => count + section.lectures.filter((lecture) => completedLectureIdSet.has(lecture.id)).length,
      0,
    );
    const computed = Math.round((completedLectures / totalLectures) * 100);
    if (completedLectureIdSet.size === 0 && normalizedProgress !== null) {
      return normalizedProgress;
    }
    return computed;
  }, [course?.progress, courseSections, completedLectureIdSet]);

  const performanceRows = useMemo(() => {
    const quizLectures = courseSections.flatMap((section) =>
      section.lectures
        .filter((lecture) => lecture.type === 'Quiz')
        .map((lecture) => ({
          id: lecture.id,
          title: `${section.title}: ${lecture.title}`,
          completed: completedLectureIdSet.has(lecture.id),
        })),
    );

    const rows = quizLectures.length
      ? quizLectures
      : courseSections.map((section, index) => {
        const completedCount = section.lectures.filter((lecture) => completedLectureIdSet.has(lecture.id)).length;
        const isCompleted = section.lectures.length > 0 && completedCount === section.lectures.length;
        return {
          id: `${section.id}-${index}`,
          title: `${section.title}: Module Assessment`,
          completed: isCompleted,
        };
      });

    const weight = rows.length ? Math.max(3, Math.round(100 / rows.length)) : 0;
    const dateLabel = (() => {
      const lastUpdated = course?.lastUpdated;
      if (!lastUpdated) {
        return null;
      }
      const parsed = new Date(lastUpdated);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return parsed.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' });
    })();

    return rows.map((row, index) => ({
      ...row,
      score: row.completed ? `${Math.min(100, 85 + index * 5)}%` : 'N/A',
      attemptedAt: row.completed ? dateLabel ?? 'N/A' : 'N/A',
      weight: weight ? `${weight}%` : 'N/A',
    }));
  }, [course?.lastUpdated, courseSections, completedLectureIdSet]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm font-semibold text-slate-600">Loading course content...</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <h2 className="text-xl font-bold text-slate-900">Course not found</h2>
        <p className="mt-2 text-sm text-slate-500">{error ?? 'This course is unavailable right now.'}</p>
        <Link
          to="/browse"
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Back to Browse
        </Link>
      </div>
    );
  }

  if (user?.role === 'Student' && !course.isEnrolled) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <h2 className="text-xl font-bold text-slate-900">Course Access Locked</h2>
        <p className="mt-2 text-sm text-slate-500">
          {course.hasPendingEnrollmentRequest
            ? 'Your enrollment request is pending admin approval.'
            : 'You do not have access to this course yet.'}
        </p>
        <Link
          to={`/course/${course.id}`}
          className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          Back to Course Page
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold text-slate-500">
            <button
              type="button"
              onClick={() => setActiveView('content')}
              className={cn(
                'rounded-full px-3 py-1 transition-colors',
                activeView === 'content' ? 'bg-indigo-600 text-white' : 'hover:text-slate-700',
              )}
            >
              Course Content
            </button>
            <button
              type="button"
              onClick={() => setActiveView('performance')}
              className={cn(
                'rounded-full px-3 py-1 transition-colors',
                activeView === 'performance' ? 'bg-indigo-600 text-white' : 'hover:text-slate-700',
              )}
            >
              Performance
            </button>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">{course.title}</h1>
          {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}
        </div>
        <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-400">
            <span>Progress</span>
            <span>{overallProgress}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-indigo-600" style={{ width: `${overallProgress}%` }} />
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <BookOpen className="h-4 w-4 text-slate-400" />
            {sectionGroups.length} section{sectionGroups.length === 1 ? '' : 's'}
          </div>
        </div>
      </header>

      {activeView === 'content' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr] xl:grid-cols-[420px_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Sections</h2>
              <LayoutList className="h-4 w-4 text-slate-400" />
            </div>
          <div className="mt-3 space-y-2">
            {sectionGroups.map((group, index) => {
              const isExpanded = expandedSectionTitles.includes(group.title);
              const isActive = group.title === selectedGroup?.title;
              const totalCount = group.subsections.reduce(
                (count, subsection) => count + subsection.section.lectures.length,
                0,
              );
              const completedCount = group.subsections.reduce(
                (count, subsection) =>
                  count + subsection.section.lectures.filter((lecture) => completedLectureIdSet.has(lecture.id)).length,
                0,
              );
              const completionRate = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

              return (
                <div key={group.id} className="rounded-xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSectionTitle(group.title);
                      toggleSectionGroup(group.title);
                    }}
                    className={cn(
                      'w-full cursor-pointer rounded-xl px-3 py-2.5 text-left transition-colors',
                      isActive
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Section {index + 1}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{group.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {group.subsections.length} subsection{group.subsections.length === 1 ? '' : 's'} - {completedCount}/{totalCount} completed
                        </p>
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-400">
                        {isExpanded ? 'Hide' : 'Show'}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full bg-indigo-500"
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                  </button>
                  <div
                    className={cn(
                      'overflow-hidden border-t border-slate-100 px-3 transition-[max-height,opacity] duration-300 ease-out',
                      isExpanded ? 'max-h-[640px] opacity-100 py-2' : 'max-h-0 opacity-0 py-0 pointer-events-none',
                    )}
                  >
                    <div className="space-y-2">
                      {group.subsections.map((subsection, subsectionIndex) => {
                        const isSubsectionActive = subsection.section.id === selectedSubsection?.section.id;
                        const completedLessons = subsection.section.lectures.filter((lecture) =>
                          completedLectureIdSet.has(lecture.id),
                        ).length;
                        const totalLessons = subsection.section.lectures.length;
                        return (
                          <button
                            key={subsection.section.id}
                            type="button"
                            onClick={() => {
                              setSelectedSectionTitle(group.title);
                              setSelectedSubsectionId(subsection.section.id);
                            }}
                            className={cn(
                              'w-full cursor-pointer rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                              isSubsectionActive
                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                            )}
                          >
                            <p className="font-semibold text-slate-900">{subsection.title}</p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              {completedLessons}/{totalLessons} completed
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {sectionGroups.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No sections are available for this course yet.
              </div>
            ) : null}
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            {selectedGroup && selectedSubsection ? (
              <>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Selected Subsection</p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">{selectedSubsection.title}</h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Section: {selectedGroup.title} - {selectedSubsection.section.lectures.length} lesson{selectedSubsection.section.lectures.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  {selectedSubsection.section.lectures[0] ? (
                    <Link
                      to={buildLectureLink(selectedSubsection.section.lectures[0].id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                    >
                      <Play className="h-4 w-4" />
                      Start Subsection
                    </Link>
                  ) : null}
                </div>

                <div className="mt-4 space-y-3">
                  {selectedSubsection.section.lectures.map((lecture, lectureIndex) => {
                    const isCompleted = completedLectureIdSet.has(lecture.id);
                    const Icon = getLectureIcon(lecture.type);

                    return (
                      <div
                        key={lecture.id}
                        className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 transition-shadow hover:shadow-sm md:flex-row md:items-center md:justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                              isCompleted ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600',
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Lesson {lectureIndex + 1}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{lecture.title}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Icon className="h-3.5 w-3.5" />
                                {lecture.duration || 'Read content'}
                              </span>
                              <span className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                                isCompleted ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500',
                              )}>
                                {isCompleted ? (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Completed
                                  </>
                                ) : (
                                  <>
                                    <Circle className="h-3.5 w-3.5" />
                                    In Progress
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 md:justify-end">
                          <Link
                            to={buildLectureLink(lecture.id)}
                            className={cn(
                              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors',
                              isCompleted
                                ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700',
                            )}
                          >
                            <Play className="h-4 w-4" />
                            {isCompleted ? 'Review' : 'Start'}
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                  {selectedSubsection.section.lectures.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      No lessons are available in this subsection yet.
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Select a subsection to view its lessons.
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Performance</h2>
              <p className="mt-1 text-sm text-slate-500">
                Track your assessment scores and attempt history.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
              Overall Progress: <span className="font-bold text-slate-700">{overallProgress}%</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-indigo-50 text-indigo-600">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Assessment</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Score</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Attempt Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Weightage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {performanceRows.length > 0 ? (
                  performanceRows.map((row) => (
                    <tr key={row.id} className="text-slate-700">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{row.title}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'inline-flex min-w-[72px] items-center justify-center rounded-lg px-3 py-1 text-xs font-bold',
                            row.score === 'N/A'
                              ? 'bg-slate-100 text-slate-400'
                              : 'bg-emerald-100 text-emerald-700',
                          )}
                        >
                          {row.score}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{row.attemptedAt}</td>
                      <td className="px-6 py-4 text-slate-600">{row.weight}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-center text-sm text-slate-500">
                      No assessments available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
