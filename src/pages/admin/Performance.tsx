import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Download,
  CheckCircle2,
  Sparkles,
  Zap,
  Star,
} from 'lucide-react';
import { fetchAdminPerformance } from '../../lib/courseApi';
import type { AdminPopularCourseMetric, AdminTopStudentMetric } from '../../types';

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);

export const AdminPerformance = () => {
  const [topStudents, setTopStudents] = useState<AdminTopStudentMetric[]>([]);
  const [popularCourses, setPopularCourses] = useState<AdminPopularCourseMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    fetchAdminPerformance()
      .then((performance) => {
        if (isCancelled) {
          return;
        }

        setTopStudents(performance.topStudents);
        setPopularCourses(performance.popularCourses);
      })
      .catch((fetchError) => {
        if (isCancelled) {
          return;
        }

        setTopStudents([]);
        setPopularCourses([]);
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to fetch performance analytics.');
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const summaryMetrics = useMemo(() => {
    const quizAttempts = topStudents.reduce((total, student) => total + student.quizzesTaken, 0);
    const bestQuizScore = topStudents.length > 0
      ? Math.max(...topStudents.map((student) => student.avgQuizScore))
      : 0;

    const categoryCounts = popularCourses.reduce<Record<string, number>>((accumulator, course) => {
      accumulator[course.category] = (accumulator[course.category] ?? 0) + 1;
      return accumulator;
    }, {});

    const topCategory = Object.entries(categoryCounts).sort((first, second) => second[1] - first[1])[0]?.[0] ?? 'N/A';

    return {
      quizAttempts,
      bestQuizScore,
      topCategory,
    };
  }, [popularCourses, topStudents]);

  return (
    <div className="max-w-6xl mx-auto space-y-7 pb-10">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">Reports &amp; Analytics</h1>
          <p className="text-slate-500 max-w-2xl">
            Track platform learning progress, course completion rates, and student achievement metrics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 inline-flex items-center gap-3">
            <CalendarDays className="w-4 h-4" />
            Last 12 Months
          </button>
          <button className="px-5 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm font-semibold inline-flex items-center gap-2 shadow-lg shadow-blue-200">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <article className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Live</span>
          </div>
          <p className="text-sm text-slate-500 mb-2">Quiz Attempts in Top 5</p>
          <p className="text-5xl font-bold text-slate-900">{formatNumber(summaryMetrics.quizAttempts)}</p>
        </article>

        <article className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-indigo-600" />
            </div>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">Top Choice</span>
          </div>
          <p className="text-sm text-slate-500 mb-2">Top Performing Category</p>
          <p className="text-5xl font-bold text-slate-900">{summaryMetrics.topCategory}</p>
          <p className="text-sm mt-1 text-indigo-600 font-semibold">Based on the most popular courses</p>
        </article>

        <article className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center">
              <Zap className="w-6 h-6 text-orange-500" />
            </div>
            <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded">Best</span>
          </div>
          <p className="text-sm text-slate-500 mb-2">Highest Avg Quiz Score</p>
          <p className="text-5xl font-bold text-slate-900">{summaryMetrics.bestQuizScore.toFixed(1)}%</p>
          <div className="mt-4 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 rounded-full" style={{ width: `${summaryMetrics.bestQuizScore}%` }} />
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <article className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-3xl font-semibold text-slate-900">Top 5 Students by Quiz Scores</h3>
            <button className="text-sm font-semibold text-blue-600 hover:text-blue-700">View All</button>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3 font-bold">Student Name</th>
                <th className="px-5 py-3 font-bold">Courses Completed</th>
                <th className="px-5 py-3 font-bold text-right">Avg. Quiz Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-500">Loading student analytics...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-red-600">{error}</td>
                </tr>
              ) : topStudents.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-500">No quiz attempts found yet.</td>
                </tr>
              ) : (
                topStudents.map((student) => (
                  <tr key={student.studentId}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-full bg-slate-200" />
                        <div>
                          <p className="font-semibold text-slate-800">{student.studentName}</p>
                          <p className="text-xs text-slate-500">{student.quizzesTaken} quizzes counted</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600 font-medium">{student.coursesCompleted} completed</td>
                    <td className="px-5 py-4 text-right font-bold text-emerald-600">
                      {student.avgQuizScore.toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </article>

        <article className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-3xl font-semibold text-slate-900">Most Popular Courses</h3>
            <button className="text-sm font-semibold text-blue-600 hover:text-blue-700">Full List</button>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3 font-bold">Course Title</th>
                <th className="px-5 py-3 font-bold">Enrollments</th>
                <th className="px-5 py-3 font-bold text-right">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-500">Loading course analytics...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-red-600">{error}</td>
                </tr>
              ) : popularCourses.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-500">No published courses found yet.</td>
                </tr>
              ) : (
                popularCourses.map((course) => (
                  <tr key={course.courseId}>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">{course.title}</p>
                      <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{course.category}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600 font-medium">{formatNumber(course.enrollments)}</td>
                    <td className="px-5 py-4 text-right">
                      <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        {course.rating.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </article>
      </section>

      <footer className="pt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm text-slate-400">
        <p>&copy; 2024 Admin Management Platform. All rights reserved.</p>
        <div className="flex items-center gap-5">
          <button className="hover:text-slate-600 transition-colors">Privacy Policy</button>
          <button className="hover:text-slate-600 transition-colors">Terms of Service</button>
          <button className="hover:text-slate-600 transition-colors">Contact Support</button>
        </div>
      </footer>
    </div>
  );
};
