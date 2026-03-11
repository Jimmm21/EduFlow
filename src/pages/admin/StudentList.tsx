import React, { useEffect, useMemo, useState } from 'react';
import { Filter, Star, Trash2 } from 'lucide-react';
import { MOCK_COURSE_ENROLLMENTS, MOCK_COURSE_REVIEWS, MOCK_COURSES } from '../../mockData';
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

const buildRatingKey = (courseId: string, studentName: string) =>
  `${courseId}::${studentName.trim().toLowerCase()}`;

const toFallbackEnrollments = (courses: Course[]): AdminStudentEnrollment[] => {
  const titleByCourseId = new Map(courses.map((course) => [course.id, course.title]));
  const ratingLookup = new Map(
    MOCK_COURSE_REVIEWS.map((review) => [
      buildRatingKey(review.courseId, review.studentName),
      review.rating,
    ]),
  );

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
    studentRating: ratingLookup.get(buildRatingKey(enrollment.courseId, enrollment.studentName)),
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

  const reviewRatings = useMemo(
    () =>
      new Map(
        MOCK_COURSE_REVIEWS.map((review) => [
          buildRatingKey(review.courseId, review.studentName),
          review.rating,
        ]),
      ),
    [],
  );

  const getRatingValue = (enrollment: AdminStudentEnrollment) => {
    const rawRating =
      typeof enrollment.studentRating === 'number'
        ? enrollment.studentRating
        : reviewRatings.get(buildRatingKey(enrollment.courseId, enrollment.studentName));
    if (typeof rawRating !== 'number') {
      return null;
    }
    const rounded = Math.round(rawRating);
    return Math.max(0, Math.min(5, rounded));
  };

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
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Student Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Student Email</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Course</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Enrolled Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Progress</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEnrollments.map((enrollment) => {
                  const isRemoving = actionEnrollmentId === enrollment.id;
                  const ratingValue = getRatingValue(enrollment);
                  const progressValue = Math.max(0, Math.min(100, enrollment.progress));
                  const isCompleted = enrollment.learningStatus === 'completed';

                  return (
                    <tr key={enrollment.id} className="align-top">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{enrollment.studentName}</p>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{enrollment.studentEmail}</td>
                      <td className="px-6 py-4 text-slate-600">{enrollment.courseTitle}</td>
                      <td className="px-6 py-4 text-slate-600">{enrollment.enrolledAt}</td>
                      <td className="px-6 py-4">
                        <div className="min-w-[200px] space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">{progressValue}%</span>
                            <span>{isCompleted ? 'Completed' : 'In progress'}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200">
                            <div
                              className={cn(
                                'h-2 rounded-full transition-[width]',
                                isCompleted ? 'bg-emerald-500' : 'bg-indigo-500',
                              )}
                              style={{ width: `${progressValue}%` }}
                            />
                          </div>
                          {isCompleted ? (
                            <div className="flex items-center gap-2 text-xs">
                              {ratingValue !== null ? (
                                <>
                                  <div className="flex items-center gap-0.5">
                                    {Array.from({ length: 5 }, (_, index) => {
                                      const filled = index < ratingValue;
                                      return (
                                        <Star
                                          key={`${enrollment.id}-star-${index}`}
                                          className={cn(
                                            'h-3 w-3',
                                            filled ? 'text-amber-500' : 'text-slate-300',
                                          )}
                                          fill={filled ? 'currentColor' : 'none'}
                                        />
                                      );
                                    })}
                                  </div>
                                  <span className="font-semibold text-amber-600">{ratingValue}/5</span>
                                </>
                              ) : (
                                <span className="text-slate-400">Not rated yet</span>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openRemoveStudentConfirmation(enrollment)}
                          disabled={isRemoving}
                          className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <Trash2 className="h-4 w-4" />
                          {isRemoving ? 'Removing...' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
