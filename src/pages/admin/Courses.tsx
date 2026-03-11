import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus, Users, Star, PencilLine, Clock4, Settings, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { MOCK_COURSES } from '../../mockData';
import { cn } from '../../utils';
import type { Course } from '../../types';
import { API_BASE_URL as COURSE_API_BASE_URL } from '../../lib/apiBase';

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

  return undefined;
};

export const AdminCourses = () => {
  const location = useLocation();
  const [courses, setCourses] = useState<Course[]>(MOCK_COURSES);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as { notice?: string } | null;
    if (!state?.notice) {
      return;
    }

    setNoticeMessage(state.notice);
    const timer = window.setTimeout(() => {
      setNoticeMessage(null);
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [location.state]);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/courses`);
        const payload = await response.json().catch(() => null);
        const payloadRecord =
          payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
        const payloadCourses = payloadRecord?.courses;

        if (!response.ok || payloadRecord?.success !== true || !Array.isArray(payloadCourses)) {
          setIsLoading(false);
          return;
        }

        setCourses(payloadCourses as Course[]);
      } catch {
        // Keep mock fallback when backend is unavailable.
      } finally {
        setIsLoading(false);
      }
    };

    fetchCourses();
  }, []);

  const openDeleteDialog = (course: Course) => {
    setDeleteError(null);
    setDeleteTarget(course);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) {
      return;
    }
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const confirmDeleteCourse = async () => {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`${COURSE_API_BASE_URL}/api/admin/courses/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);
      const payloadRecord =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
      if (!response.ok || payloadRecord?.success !== true) {
        setDeleteError(extractApiMessage(payload) ?? 'Unable to delete course.');
        return;
      }

      setCourses((previous) => previous.filter((course) => course.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteError(null);
    } catch {
      setDeleteError('Cannot reach the course service. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Courses</h1>
          <p className="text-slate-500">All courses currently owned by this admin account.</p>
        </div>
        <Link
          to="/admin/courses/new"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-200 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          New Course
        </Link>
      </header>
      {noticeMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {noticeMessage}
        </div>
      ) : null}

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Course List</h2>
          <span className="text-sm text-slate-500">{courses.length} total</span>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-slate-500">Loading courses...</div>
        ) : courses.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-slate-600 font-medium mb-3">No courses yet.</p>
            <Link to="/admin/courses/new" className="text-indigo-600 font-semibold hover:text-indigo-700">
              Create your first course
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {courses.map((course) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 flex flex-col md:flex-row md:items-center gap-5"
              >
                <Link to={`/admin/courses/${course.id}/overview`} className="flex flex-1 flex-col gap-5 md:flex-row md:items-center min-w-0 group">
                  <div className="w-full md:w-40 h-24 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                    <img src={course.image} alt={course.title} className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">{course.title}</h3>
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md',
                          course.status === 'Published' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {course.status}
                      </span>
                    </div>

                    <p className="text-sm text-slate-500 truncate">{course.subtitle}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {course.studentsCount.toLocaleString()} students
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Star className="w-4 h-4" />
                        {course.rating > 0 ? course.rating.toFixed(1) : 'No ratings'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock4 className="w-4 h-4" />
                        Updated {course.lastUpdated}
                      </span>
                    </div>
                  </div>
                </Link>

                <div className="md:self-center flex items-center gap-3">
                  <Link
                    to={`/admin/courses/${course.id}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    <PencilLine className="w-4 h-4" />
                    Edit
                  </Link>
                  <Link
                    to={`/admin/courses/${course.id}?step=4`}
                    aria-label={`Open settings for ${course.title}`}
                    title="Course Settings"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => openDeleteDialog(course)}
                    aria-label={`Delete ${course.title}`}
                    title="Delete Course"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-red-500">Confirm Delete</p>
              <h3 className="text-xl font-bold text-slate-900">{deleteTarget.title}</h3>
              <p className="text-sm leading-6 text-slate-500">
                This will permanently delete the course and all of its sections and lessons.
              </p>
              {deleteError ? <p className="text-sm font-medium text-red-600">{deleteError}</p> : null}
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={isDeleting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteCourse}
                disabled={isDeleting}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
