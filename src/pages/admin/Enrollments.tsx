import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Filter, XCircle } from 'lucide-react';
import { MOCK_COURSES, MOCK_ENROLLMENT_REQUESTS } from '../../mockData';
import type { Course, EnrollmentRequest, EnrollmentRequestStatus } from '../../types';
import { cn } from '../../utils';
import { ConfirmDialog } from '../../components/ConfirmDialog';
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
  const [confirmationAction, setConfirmationAction] = useState<{
    requestId: string;
    status: 'Accepted' | 'Rejected';
    studentName: string;
  } | null>(null);
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
    const visibleRequests = requests.filter((request) => request.status === 'Pending');

    if (selectedCourseId === 'all') {
      return visibleRequests;
    }

    return visibleRequests.filter((request) => request.courseId === selectedCourseId);
  }, [requests, selectedCourseId]);

  const counts = useMemo(
    () => ({
      total: filteredRequests.length,
      pending: filteredRequests.filter((request) => request.status === 'Pending').length,
      rejected: requests.filter((request) => request.status === 'Rejected').length,
      movedToStudentList: requests.filter((request) => request.status === 'Accepted').length,
    }),
    [filteredRequests, requests],
  );

  const openRequestStatusConfirmation = (requestId: string, status: 'Accepted' | 'Rejected') => {
    const currentRequest = requests.find((request) => request.id === requestId);
    if (!currentRequest) {
      setError('Enrollment request not found.');
      return;
    }

    if (currentRequest.status !== 'Pending') {
      setError('Only pending requests can be accepted or rejected.');
      return;
    }

    setConfirmationAction({
      requestId,
      status,
      studentName: currentRequest.studentName,
    });
  };

  const updateRequestStatus = async () => {
    if (!confirmationAction) {
      return;
    }

    const { requestId, status } = confirmationAction;
    setActionRequestId(requestId);
    setError(null);

    try {
      const updatedRequest = await updateAdminEnrollmentRequest(requestId, status);
      setRequests((previousRequests) =>
        previousRequests.map((request) =>
          request.id === requestId ? updatedRequest : request,
        ),
      );
      setConfirmationAction(null);
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
          <p className="mb-2 text-sm text-slate-500">Moved to Student List</p>
          <p className="text-4xl font-bold text-emerald-600">{counts.movedToStudentList}</p>
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
            <p className="mb-2 text-lg font-semibold text-slate-900">No pending requests found.</p>
            <p className="text-sm text-slate-500">Accepted requests move to Student List and rejected requests are hidden.</p>
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
                        onClick={() => openRequestStatusConfirmation(request.id, 'Accepted')}
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
                        onClick={() => openRequestStatusConfirmation(request.id, 'Rejected')}
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

      <ConfirmDialog
        isOpen={confirmationAction !== null}
        badge="Confirm Action"
        title={
          confirmationAction?.status === 'Accepted'
            ? `Are you sure you want to accept the student ${confirmationAction.studentName}?`
            : `Are you sure you want to reject the student ${confirmationAction?.studentName ?? ''}?`
        }
        description="This will immediately update the student's enrollment status."
        tone={confirmationAction?.status === 'Rejected' ? 'danger' : 'primary'}
        confirmLabel={confirmationAction?.status === 'Accepted' ? 'Accept Student' : 'Reject Student'}
        confirmingLabel={confirmationAction?.status === 'Accepted' ? 'Accepting...' : 'Rejecting...'}
        isConfirming={confirmationAction ? actionRequestId === confirmationAction.requestId : false}
        onCancel={() => {
          if (actionRequestId) {
            return;
          }
          setConfirmationAction(null);
        }}
        onConfirm={updateRequestStatus}
      />
    </div>
  );
};
