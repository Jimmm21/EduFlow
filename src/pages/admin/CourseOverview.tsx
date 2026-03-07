import React, { useEffect, useState } from 'react';
import { ArrowLeft, Star, Users, Clock4, PencilLine } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { MOCK_COURSES, MOCK_COURSE_ENROLLMENTS, MOCK_COURSE_REVIEWS, MOCK_ENROLLMENT_REQUESTS } from '../../mockData';
import { cn } from '../../utils';
import type { Course } from '../../types';

const COURSE_API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:8001'
).replace(/\/$/, '');

export const AdminCourseOverview = () => {
  const { id } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setCourse(null);
      setIsLoading(false);
      return;
    }

    const fetchCourse = async () => {
      try {
        const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/courses/${id}`);
        const payload = await response.json().catch(() => null);
        const payloadRecord =
          payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
        const fetchedCourse = payloadRecord?.course;

        if (response.ok && payloadRecord?.success === true && fetchedCourse && typeof fetchedCourse === 'object') {
          setCourse(fetchedCourse as Course);
          return;
        }
      } catch {
        // Fallback handled below.
      }

      setCourse(MOCK_COURSES.find((item) => item.id === id) ?? null);
    };

    fetchCourse().finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">Loading course...</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-5xl mx-auto py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">Course not found</h1>
          <p className="text-slate-500">The course you selected does not exist in the current admin data.</p>
          <Link to="/admin/courses" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            <ArrowLeft className="w-4 h-4" />
            Back to Course List
          </Link>
        </div>
      </div>
    );
  }

  const enrollments = MOCK_COURSE_ENROLLMENTS.filter((item) => item.courseId === course.id);
  const reviews = MOCK_COURSE_REVIEWS.filter((item) => item.courseId === course.id);
  const pendingRequests = MOCK_ENROLLMENT_REQUESTS.filter(
    (item) => item.courseId === course.id && item.status === 'Pending',
  );
  const averageProgress = enrollments.length
    ? Math.round(enrollments.reduce((sum, item) => sum + item.progress, 0) / enrollments.length)
    : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <Link to="/admin/courses" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            <ArrowLeft className="w-4 h-4" />
            Back to Course List
          </Link>
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">{course.title}</h1>
            <p className="mt-2 max-w-3xl text-slate-500">{course.subtitle}</p>
          </div>
        </div>

        <Link
          to={`/admin/courses/${course.id}`}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition-colors hover:bg-indigo-700"
        >
          <PencilLine className="w-4 h-4" />
          Edit Course
        </Link>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500 mb-2">Enrolled Students</p>
          <p className="text-4xl font-bold text-slate-900">{course.studentsCount.toLocaleString()}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500 mb-2">Pending Requests</p>
          <p className="text-4xl font-bold text-amber-600">{pendingRequests.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500 mb-2">Average Rating</p>
          <p className="text-4xl font-bold text-slate-900">{course.rating > 0 ? course.rating.toFixed(1) : '0.0'}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500 mb-2">Avg. Progress</p>
          <p className="text-4xl font-bold text-slate-900">{averageProgress}%</p>
        </article>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.15fr,0.85fr] gap-5">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-3xl font-semibold text-slate-900">Enrollment Details</h2>
            <p className="mt-1 text-sm text-slate-500">Students currently enrolled in this course.</p>
          </div>
          {enrollments.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">No enrolled students yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {enrollments.map((student) => (
                <div key={student.id} className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{student.studentName}</p>
                    <p className="text-sm text-slate-500">{student.studentEmail}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Enrolled {student.enrolledAt}</p>
                  </div>
                  <div className="min-w-[180px]">
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
                      <span>Progress</span>
                      <span className="font-semibold text-slate-700">{student.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-indigo-600" style={{ width: `${student.progress}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <aside className="space-y-5">
          <article className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-2xl font-semibold text-slate-900 mb-4">Course Snapshot</h3>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Status</span>
                <span
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide',
                    course.status === 'Published' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {course.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Category</span>
                <span className="font-semibold text-slate-900">{course.category}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Level</span>
                <span className="font-semibold text-slate-900">{course.level}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Last Updated</span>
                <span className="font-semibold text-slate-900">{course.lastUpdated}</span>
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="text-2xl font-semibold text-slate-900">Ratings & Reviews</h3>
            </div>
            {reviews.length === 0 ? (
              <div className="px-6 py-10 text-center text-slate-500">No ratings submitted yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {reviews.map((review) => (
                  <div key={review.id} className="px-6 py-5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900">{review.studentName}</p>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        {review.rating.toFixed(1)}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-slate-600">{review.comment}</p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{review.submittedAt}</p>
                  </div>
                ))}
              </div>
            )}
          </article>
        </aside>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <Users className="w-4 h-4" />
            {enrollments.length} students shown in sample roster
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock4 className="w-4 h-4" />
            {course.sections.length} sections in curriculum
          </span>
          <span className="inline-flex items-center gap-2">
            <Star className="w-4 h-4" />
            {reviews.length} recent ratings
          </span>
        </div>
      </section>
    </div>
  );
};
