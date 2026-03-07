import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Filter, XCircle, Users } from 'lucide-react';
import { MOCK_COURSES, MOCK_ENROLLMENT_REQUESTS } from '../../mockData';
import type { Course, EnrollmentRequest, EnrollmentRequestStatus } from '../../types';
import { cn } from '../../utils';
import {
  fetchAdminCourses,
  fetchAdminEnrollmentRequests,
  updateAdminEnrollmentRequest,
} from '../../lib/courseApi';

const statusStyles: Record<EnrollmentRequestStatus, string> = {
  Pending: 'bg-amber-50 text-amber-700',
  Accepted: 'bg-emerald-50 text-emerald-700',
  Rejected: 'bg-rose-50 text-rose-700',
};

export const AdminEnrollments = () => {
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [courses, setCourses] = useState<Course[]>(MOCK_COURSES);
  const [requests, setRequests] = useState<EnrollmentRequest[]>(MOCK_ENROLLMENT_REQUESTS);
  const [isLoading, setIsLoading] = useState(true);
  const [actionRequestId, setActionRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [adminCourses, enrollmentRequests] = await Promise.all([
          fetchAdminCourses(),
          fetchAdminEnrollmentRequests(),
        ]);
        setCourses(adminCourses);
        setRequests(enrollmentRequests);
      } catch (loadError) {
        setCourses(MOCK_COURSES);
        setRequests(MOCK_ENROLLMENT_REQUESTS);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load enrollment requests from backend.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const filteredRequests = useMemo(() => {
    if (selectedCourseId === 'all') {
      return requests;
    }

    return requests.filter((request) => request.courseId === selectedCourseId);
  }, [requests, selectedCourseId]);

  const counts = useMemo(
    () => ({
      total: filteredRequests.length,
      pending: filteredRequests.filter((request) => request.status === 'Pending').length,
      accepted: filteredRequests.filter((request) => request.status === 'Accepted').length,
      rejected: filteredRequests.filter((request) => request.status === 'Rejected').length,
    }),
    [filteredRequests],
  );

  const updateRequestStatus = async (requestId: string, status: EnrollmentRequestStatus) => {
    setActionRequestId(requestId);
    setError(null);

    try {
      const updatedRequest = await updateAdminEnrollmentRequest(requestId, status);
      setRequests((previousRequests) =>
        previousRequests.map((request) =>
          request.id === requestId ? updatedRequest : request,
        ),
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update enrollment request.');
    } finally {
      setActionRequestId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-slate-900">Enrollment List</h1>
          <p className="max-w-2xl text-slate-500">
            Review student enrollment requests. Accepting a request grants course access immediately.
          </p>
        </div>

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
      </header>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {courses.map((course) => {
          const courseRequestCount = requests.filter((request) => request.courseId === course.id).length;
          const pendingCount = requests.filter(
            (request) => request.courseId === course.id && request.status === 'Pending',
          ).length;

          return (
            <button
              key={course.id}
              type="button"
              onClick={() => setSelectedCourseId(course.id)}
              className={cn(
                'rounded-2xl border bg-white p-5 text-left transition-colors',
                selectedCourseId === course.id
                  ? 'border-indigo-300 ring-4 ring-indigo-100'
                  : 'border-slate-200 hover:border-slate-300',
              )}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                  <Users className="h-5 w-5 text-slate-600" />
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {courseRequestCount} requests
                </span>
              </div>
              <h2 className="text-lg font-semibold text-slate-900">{course.title}</h2>
              <p className="mt-2 text-sm text-slate-500">{pendingCount} pending approvals</p>
            </button>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="mb-2 text-sm text-slate-500">Visible Requests</p>
          <p className="text-4xl font-bold text-slate-900">{counts.total}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="mb-2 text-sm text-slate-500">Pending</p>
          <p className="text-4xl font-bold text-amber-600">{counts.pending}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="mb-2 text-sm text-slate-500">Accepted</p>
          <p className="text-4xl font-bold text-emerald-600">{counts.accepted}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="mb-2 text-sm text-slate-500">Rejected</p>
          <p className="text-4xl font-bold text-rose-600">{counts.rejected}</p>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-3xl font-semibold text-slate-900">Student Enrollment Requests</h3>
          <p className="mt-1 text-sm text-slate-500">
            {selectedCourseId === 'all'
              ? 'Showing requests across every course.'
              : `Showing requests for ${courses.find((course) => course.id === selectedCourseId)?.title ?? 'the selected course'}.`}
          </p>
        </div>

        {isLoading ? (
          <div className="px-6 py-12 text-center">
            <p className="text-lg font-semibold text-slate-900">Loading enrollment requests...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="mb-2 text-lg font-semibold text-slate-900">No enrollment requests found.</p>
            <p className="text-sm text-slate-500">Choose another course or wait for new student applications.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRequests.map((request) => {
              const course = courses.find((item) => item.id === request.courseId);
              const isActing = actionRequestId === request.id;

              return (
                <article key={request.id} className="px-6 py-5">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="text-xl font-semibold text-slate-900">{request.studentName}</h4>
                        <span className={cn('rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', statusStyles[request.status])}>
                          {request.status}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 text-sm text-slate-500">
                        <p>{request.studentEmail}</p>
                        <p>Course: {course?.title ?? request.courseTitle ?? 'Unknown course'}</p>
                        <p>Requested on {request.requestedAt}</p>
                      </div>
                      {request.note ? <p className="max-w-2xl text-sm leading-6 text-slate-600">{request.note}</p> : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateRequestStatus(request.id, 'Accepted')}
                        disabled={isActing}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-70',
                          request.status === 'Accepted'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700',
                        )}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {isActing && request.status !== 'Accepted' ? 'Updating...' : 'Accept'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRequestStatus(request.id, 'Rejected')}
                        disabled={isActing}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-70',
                          request.status === 'Rejected'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-rose-600 text-white hover:bg-rose-700',
                        )}
                      >
                        <XCircle className="h-4 w-4" />
                        {isActing && request.status !== 'Rejected' ? 'Updating...' : 'Reject'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
