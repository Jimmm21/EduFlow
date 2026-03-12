import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Sparkles, ShieldCheck, Users2, TrendingUp, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { fetchPublicCourses } from '../lib/courseApi';
import { buildCourseStats, formatStatCount } from '../lib/courseStats';
import { useAuth } from '../auth/AuthContext';
import type { Course } from '../types';

const SECTION_FADE = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 } };

const scoreDate = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const LandingPage = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const publicCourses = await fetchPublicCourses();
        setCourses(publicCourses);
      } catch {
        setCourses([]);
      }
    };

    loadCourses();
  }, []);

  const latestCourse = useMemo(() => {
    if (!courses.length) {
      return null;
    }
    return [...courses].sort((a, b) => scoreDate(b.lastUpdated) - scoreDate(a.lastUpdated))[0];
  }, [courses]);

  const stats = useMemo(() => buildCourseStats(courses), [courses]);

  const latestCourseLink = latestCourse
    ? user
      ? `/course/${latestCourse.id}`
      : `/login?redirect=${encodeURIComponent(`/course/${latestCourse.id}`)}`
    : '/login';

  return (
    <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'Space Grotesk', 'Manrope', system-ui, sans-serif" }}>
      <header className="relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-500/30 blur-3xl" />
          <div className="absolute top-40 right-[-120px] h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute bottom-[-160px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl" />
        </div>

        <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight">EduFlow</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="rounded-full px-4 py-2 text-sm font-semibold text-white/80 transition hover:text-white">
              Sign in
            </Link>
            <Link to="/register" className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-indigo-50">
              Get started
            </Link>
          </div>
        </nav>

        <div className="relative z-10 mx-auto grid max-w-6xl gap-10 px-6 pb-20 pt-12 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-8">
            <motion.span
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white/70"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Sparkles className="h-4 w-4" />
              Learning platforms reimagined
            </motion.span>
            <motion.h1
              className="text-4xl font-semibold leading-tight md:text-5xl lg:text-6xl"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              Build confidence with structured courses and real outcomes.
            </motion.h1>
            <motion.p
              className="max-w-xl text-lg text-white/70"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              EduFlow blends focused content, measurable progress, and smart reminders so teams and learners stay on
              track from day one.
            </motion.p>
            <motion.div
              className="flex flex-wrap items-center gap-4"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/40 transition hover:bg-indigo-400"
              >
                Start learning <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login?redirect=/browse"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-white/50 hover:text-white"
              >
                Browse catalog
              </Link>
            </motion.div>
            <div className="flex flex-wrap gap-6 text-sm text-white/60">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                Verified instructors
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-sky-300" />
                Progress tracking
              </div>
              <div className="flex items-center gap-2">
                <Users2 className="h-4 w-4 text-indigo-300" />
                Cohort-ready
              </div>
            </div>
          </div>

          <motion.div
            className="relative rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-indigo-500/10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="absolute -right-4 top-6 rounded-full bg-emerald-400/20 px-4 py-1 text-xs font-semibold text-emerald-100">
              Latest release
            </div>
            <div className="space-y-4">
              <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-slate-900">
                <img
                  src={latestCourse?.image ?? 'https://picsum.photos/seed/course/800/600'}
                  alt={latestCourse?.title ?? 'Latest course'}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
                  {latestCourse?.category ?? 'New Course'}
                </p>
                <h3 className="mt-2 text-xl font-semibold">{latestCourse?.title ?? 'Launch-ready learning paths'}</h3>
                <p className="mt-2 text-sm text-white/70">
                  {latestCourse?.subtitle || latestCourse?.description || 'Curated lessons that move learners from basics to real projects.'}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <Link
                  to={latestCourseLink}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-indigo-50"
                >
                  View course <ArrowRight className="h-4 w-4" />
                </Link>
                {latestCourse?.promoVideo ? (
                  <a
                    href={latestCourse.promoVideo}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-white/70 transition hover:text-white"
                  >
                    <Play className="h-4 w-4" /> Watch trailer
                  </a>
                ) : null}
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      <main className="bg-white text-slate-900">
        <section className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3">
          {[
            {
              title: 'Structured pathways',
              body: 'Organize lessons, quizzes, and resources into sections that keep learners moving.',
            },
            {
              title: 'Automated nudges',
              body: 'Trigger reminders and welcome messages to keep engagement high.',
            },
            {
              title: 'Progress clarity',
              body: 'Track completion across every content type with unified progress metrics.',
            },
          ].map((feature) => (
            <motion.div
              key={feature.title}
              className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm"
              {...SECTION_FADE}
              viewport={{ once: true }}
            >
              <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{feature.body}</p>
            </motion.div>
          ))}
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-6 pb-20 pt-4 md:grid-cols-[1.3fr,0.7fr]">
          <motion.div
            className="rounded-3xl bg-slate-900 p-8 text-white"
            {...SECTION_FADE}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl font-semibold">Bring clarity to every cohort.</h2>
            <p className="mt-3 text-sm text-white/70">
              Build programs with consistent outcomes, optional quizzes, and resources that match your team’s needs.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { label: 'Active students', value: formatStatCount(stats.activeStudents) },
                { label: 'Courses launched', value: formatStatCount(stats.coursesLaunched) },
                { label: 'Avg. rating', value: stats.avgRating.toFixed(1) },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl bg-white/10 p-4">
                  <p className="text-2xl font-semibold">{stat.value}</p>
                  <p className="mt-1 text-xs uppercase tracking-widest text-white/60">{stat.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
            {...SECTION_FADE}
            viewport={{ once: true }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Get started</p>
            <h3 className="mt-3 text-xl font-semibold">Ready to launch your next cohort?</h3>
            <p className="mt-2 text-sm text-slate-500">
              Create a student account or jump into the admin dashboard to start building.
            </p>
            <div className="mt-6 space-y-3">
              <Link
                to="/register"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Create an account
              </Link>
              <Link
                to="/login?redirect=/admin"
                className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              >
                Go to admin login
              </Link>
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
};
