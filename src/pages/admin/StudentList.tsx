import React, { useEffect, useMemo, useState } from 'react';
import { Filter, GraduationCap, Trash2, Users } from 'lucide-react';
import { MOCK_COURSE_ENROLLMENTS, MOCK_COURSES } from '../../mockData';
import type { AdminStudentEnrollment, Course, LearningStatus } from '../../types';
import { cn } from '../../utils';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  fetchAdminCourses,
  fetchAdminStudentEnrollments,
  removeAdminStudentEnrollment,
} from '../../lib/courseApi';

const statusStyles: Record<LearningStatus, string> = {
  'in-progress': 'bg-indigo-50 text-indigo-700',
  completed: 'bg-emerald-50 text-emerald-700',
  wishlist: 'bg-slate-100 text-slate-600',
};

const toFallbackEnrollments = (courses: Course[]): AdminStudentEnrollment[] => {
  const titleByCourseId = new Map(courses.map((course) => [course.id, course.title]));

  return MOCK_COURSE_ENROLLMENTS.map((enrollment) => ({
    id: enrollment.id,
    courseId: enrollment.courseId,
    courseTitle: titleByCourseId.get(enrollment.courseId) ?? 'Unknown course',
    studentId: `student-${enrollment.id}`,
    studentName: enrollment.studentName,
    studentEmail: enrollment.studentEmail,
    enrolledAt: enrollment.enrolledAt,
    progress: enrollment.progress,
    learningStatus: enrollment.progress >= 100 ? 'completed' : 'in-progress',
  }));
};

export const AdminStudentList = () => {
  const [selectedCourseId, setSelectedCourseId] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | LearningStatus>('all');
  const [courses, setCourses] = useState<Course[]>(MOCK_COURSES);
  const [enrollments, setEnrollments] = useState<AdminStudentEnrollment[]>(
    toFallbackEnrollments(MOCK_COURSES),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [actionEnrollmentId, setActionEnrollmentId] = useState<string | null>(null);
  const [removalTarget, setRemovalTarget] = useState<AdminStudentEnrollment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [adminCourses, studentEnrollments] = await Promise.all([
          fetchAdminCourses(),
          fetchAdminStudentEnrollments(),
        ]);
        setCourses(adminCourses);
        setEnrollments(studentEnrollments);
      } catch (loadError) {
        setCourses(MOCK_COURSES);
        setEnrollments(toFallbackEnrollments(MOCK_COURSES));
        setError(loadError instanceof Error ? loadError.message : 'Unable to load student list from backend.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const filteredEnrollments = useMemo(() => {
    const byCourse = selectedCourseId === 'all'
      ? enrollments
      : enrollments.filter((enrollment) => enrollment.courseId === selectedCourseId);

    if (selectedStatus === 'all') {
      return byCourse;
    }

    return byCourse.filter((enrollment) => enrollment.learningStatus === selectedStatus);
  }, [enrollments, selectedCourseId, selectedStatus]);

  const summary = useMemo(
    () => ({
      totalEnrollments: filteredEnrollments.length,
      uniqueStudents: new Set(filteredEnrollments.map((enrollment) => enrollment.studentId)).size,
      completed: filteredEnrollments.filter((enrollment) => enrollment.learningStatus === 'completed').length,
      inProgress: filteredEnrollments.filter((enrollment) => enrollment.learningStatus === 'in-progress').length,
    }),
    [filteredEnrollments],
  );

  const openRemoveStudentConfirmation = (enrollment: AdminStudentEnrollment) => {
    setRemovalTarget(enrollment);
  };

  const removeStudentEnrollment = async () => {
    if (!removalTarget) {
      return;
    }

    setActionEnrollmentId(removalTarget.id);
    setError(null);

    try {
      await removeAdminStudentEnrollment(removalTarget.id);
      setEnrollments((previousEnrollments) =>
        previousEnrollments.filter((item) => item.id !== removalTarget.id),
      );
      setRemovalTarget(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove student from the course.');
    } finally {
      setActionEnrollmentId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-slate-900">Student List</h1>
          <p className="max-w-2xl text-slate-500">
            Accepted enrollment requests are moved here. Review each student and the courses they are currently taking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={selectedCourseId}
              onChange={(event) => setSelectedCourseId(event.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-700 outline-none"
            >
              <option value="all">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value as 'all' | LearningStatus)}
              className="bg-transparent text-sm font-semibold text-slate-700 outline-none"
            >
              <option value="all">All status</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      </header>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="mb-2 text-sm text-slate-500">Enrollments</p>
          <p className="text-4xl font-bold text-slate-900">{summary.totalEnrollments}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="mb-2 text-sm text-slate-500">Students</p>
          <p className="text-4xl font-bold text-indigo-600">{summary.uniqueStudents}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="mb-2 text-sm text-slate-500">In Progress</p>
          <p className="text-4xl font-bold text-amber-600">{summary.inProgress}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="mb-2 text-sm text-slate-500">Completed</p>
          <p className="text-4xl font-bold text-emerald-600">{summary.completed}</p>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-3xl font-semibold text-slate-900">Enrolled Students</h3>
          <p className="mt-1 text-sm text-slate-500">
            {selectedCourseId === 'all'
              ? 'Showing all accepted enrollments across every course.'
              : `Showing enrollments for ${courses.find((course) => course.id === selectedCourseId)?.title ?? 'the selected course'}.`}
          </p>
        </div>

        {isLoading ? (
          <div className="px-6 py-12 text-center">
            <p className="text-lg font-semibold text-slate-900">Loading student list...</p>
          </div>
        ) : filteredEnrollments.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="mb-2 text-lg font-semibold text-slate-900">No students found.</p>
            <p className="text-sm text-slate-500">Accepted requests will appear here automatically.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEnrollments.map((enrollment) => {
              const isRemoving = actionEnrollmentId === enrollment.id;

              return (
                <article key={enrollment.id} className="px-6 py-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h4 className="text-xl font-semibold text-slate-900">{enrollment.studentName}</h4>
                      <span className={cn('rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', statusStyles[enrollment.learningStatus])}>
                        {enrollment.learningStatus === 'in-progress' ? 'In Progress' : enrollment.learningStatus}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm text-slate-500">
                      <p>{enrollment.studentEmail}</p>
                      <p>Course: {enrollment.courseTitle}</p>
                      <p>Enrolled on {enrollment.enrolledAt}</p>
                    </div>
                  </div>

                  <div className="min-w-[260px] space-y-3 rounded-xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <p className="font-semibold text-slate-700">Course Progress</p>
                      <p className="font-bold text-slate-900">{enrollment.progress}%</p>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200">
                      <div
                        className={cn(
                          'h-2 rounded-full transition-[width]',
                          enrollment.learningStatus === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500',
                        )}
                        style={{ width: `${Math.max(0, Math.min(100, enrollment.progress))}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {enrollment.learningStatus === 'completed' ? (
                        <>
                          <GraduationCap className="h-4 w-4 text-emerald-600" />
                          Course completed
                        </>
                      ) : (
                        <>
                          <Users className="h-4 w-4 text-indigo-600" />
                          Student is currently learning this course
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openRemoveStudentConfirmation(enrollment)}
                      disabled={isRemoving}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <Trash2 className="h-4 w-4" />
                      {isRemoving ? 'Removing...' : 'Remove Student'}
                    </button>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        isOpen={removalTarget !== null}
        badge="Confirm Removal"
        title={
          removalTarget
            ? `Remove ${removalTarget.studentName} from ${removalTarget.courseTitle}?`
            : 'Remove student from this course?'
        }
        description="The student will no longer have access to this course."
        tone="danger"
        confirmLabel="Remove Student"
        confirmingLabel="Removing..."
        isConfirming={removalTarget ? actionEnrollmentId === removalTarget.id : false}
        onCancel={() => {
          if (actionEnrollmentId) {
            return;
          }
          setRemovalTarget(null);
        }}
        onConfirm={removeStudentEnrollment}
      />
    </div>
  );
};
