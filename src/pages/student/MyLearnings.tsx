import React, { useEffect, useMemo, useState } from 'react';
import { Play, Clock3, CheckCircle2, Heart } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils';
import type { Course, LearningStatus } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { fetchStudentLearningCourses } from '../../lib/courseApi';

type LearningTab = 'all' | LearningStatus;

const TABS: { id: LearningTab; label: string }[] = [
  { id: 'all', label: 'All Courses' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'wishlist', label: 'Wishlist' },
];

const computeCourseProgress = (course: Course) => {
  const normalizedProgress = typeof course.progress === 'number'
    ? Math.max(0, Math.min(100, Math.round(course.progress)))
    : null;
  const totalLectures = course.sections.reduce((count, section) => count + section.lectures.length, 0);
  if (totalLectures === 0) {
    return normalizedProgress ?? 0;
  }

  const completedLectureIdSet = new Set(course.completedLectureIds ?? []);
  const completedLectures = course.sections.reduce(
    (count, section) => count + section.lectures.filter((lecture) => completedLectureIdSet.has(lecture.id)).length,
    0,
  );
  const computed = Math.round((completedLectures / totalLectures) * 100);
  if (completedLectureIdSet.size === 0 && normalizedProgress !== null) {
    return normalizedProgress;
  }
  return computed;
};

export const MyLearnings = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<LearningTab>('all');
  const [learningCourses, setLearningCourses] = useState<Course[]>([]);

  useEffect(() => {
    if (!user || user.role !== 'Student') {
      setLearningCourses([]);
      return;
    }

    const loadLearningCourses = async () => {
      try {
        const courses = await fetchStudentLearningCourses(user.id);
        setLearningCourses(courses);
      } catch {
        setLearningCourses([]);
      }
    };

    loadLearningCourses();
  }, [user]);

  const myCourses = useMemo(
    () =>
      learningCourses
        .map((course) => {
          const status = course.learningStatus;
          if (!status) {
            return null;
          }

          return {
            course,
            progressInfo: {
              courseId: course.id,
              progress: computeCourseProgress(course),
              status,
            },
          };
        })
        .filter((item): item is { course: Course; progressInfo: { courseId: string; progress: number; status: LearningStatus } } => Boolean(item)),
    [learningCourses],
  );

  const filteredCourses = useMemo(() => {
    if (activeTab === 'all') {
      return myCourses;
    }

    return myCourses.filter((item) => item.progressInfo.status === activeTab);
  }, [activeTab, myCourses]);

  const tabCount = (tab: LearningTab) => {
    if (tab === 'all') {
      return myCourses.length;
    }

    return myCourses.filter((item) => item.progressInfo.status === tab).length;
  };

  const inProgressCount = tabCount('in-progress');
  const displayName = user?.name.trim() ? user.name.split(/\s+/)[0] : 'Learner';

  const getStatusMeta = (status: LearningStatus) => {
    if (status === 'completed') {
      return {
        label: 'Completed',
        icon: <CheckCircle2 className="w-4 h-4" />,
        style: 'bg-emerald-50 text-emerald-600',
      };
    }

    if (status === 'wishlist') {
      return {
        label: 'Wishlist',
        icon: <Heart className="w-4 h-4" />,
        style: 'bg-rose-50 text-rose-600',
      };
    }

    return {
      label: 'In Progress',
      icon: <Clock3 className="w-4 h-4" />,
      style: 'bg-indigo-50 text-indigo-600',
    };
  };

  return (
    <div className="space-y-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Welcome back, {displayName}!</h1>
          <p className="text-slate-500">
            You&apos;re making great progress. You have {inProgressCount} course{inProgressCount === 1 ? '' : 's'} currently in progress.
          </p>
        </div>
      </header>

      <section className="space-y-6">
        <div className="flex items-center gap-8 border-b border-slate-200">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'pb-4 text-sm font-bold transition-colors border-b-2',
                  isActive
                    ? 'text-indigo-600 border-indigo-600'
                    : 'text-slate-400 border-transparent hover:text-slate-600',
                )}
              >
                {tab.label} ({tabCount(tab.id)})
              </button>
            );
          })}
        </div>

        {filteredCourses.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
            <h3 className="text-lg font-bold text-slate-900 mb-2">No courses in this tab yet</h3>
            <p className="text-slate-500">Try another tab or browse courses to add more learning items.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredCourses.map(({ course, progressInfo }, idx) => {
              const status = getStatusMeta(progressInfo.status);
              const actionPath = progressInfo.status === 'wishlist' ? `/course/${course.id}` : `/course/${course.id}/learn`;
              const actionLabel =
                progressInfo.status === 'completed'
                  ? 'Review Course'
                  : progressInfo.status === 'wishlist'
                    ? 'View Course'
                    : 'Resume Course';

              return (
                <motion.div
                  key={`${activeTab}-${course.id}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.08 }}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden group hover:shadow-xl hover:shadow-slate-200/50 transition-all"
                >
                  <div className="aspect-video relative overflow-hidden">
                    <img src={course.image} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <Link
                        to={actionPath}
                        className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-xl active:scale-90 transition-all"
                      >
                        <Play className="w-6 h-6 fill-current" />
                      </Link>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider rounded">
                        {course.category}
                      </span>
                      <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider', status.style)}>
                        {status.icon}
                        {status.label}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">{course.title}</h3>
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-400">
                        {progressInfo.status === 'wishlist' ? 'Not Started' : `${progressInfo.progress}% Complete`}
                      </p>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progressInfo.progress}%` }}
                          transition={{ duration: 0.8, delay: 0.1 }}
                          className="h-full bg-indigo-600 rounded-full"
                        />
                      </div>
                    </div>
                    <Link
                      to={actionPath}
                      className="w-full py-2.5 bg-slate-50 text-slate-900 text-sm font-bold rounded-xl hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      {actionLabel}
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
