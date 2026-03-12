import React, { useEffect, useMemo, useState } from 'react';
import { Play, Star, Clock, Users, ChevronRight, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { fetchPublicCourses } from '../../lib/courseApi';
import { buildCourseStats, formatStatCount } from '../../lib/courseStats';
import type { Course } from '../../types';

export const StudentHome = () => {
  const [recommendedCourses, setRecommendedCourses] = useState<Course[]>([]);

  const publishedCourses = useMemo(
    () => recommendedCourses.filter((course) => course.status === 'Published' && course.visibility === 'Public'),
    [recommendedCourses],
  );

  const latestCourse = useMemo(() => {
    if (publishedCourses.length === 0) {
      return null;
    }

    const scoreDate = (value: string) => {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    return [...publishedCourses].sort((a, b) => scoreDate(b.lastUpdated) - scoreDate(a.lastUpdated))[0];
  }, [publishedCourses]);

  const stats = useMemo(() => buildCourseStats(publishedCourses), [publishedCourses]);

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const courses = await fetchPublicCourses();
        setRecommendedCourses(courses);
      } catch {
        setRecommendedCourses([]);
      }
    };

    loadCourses();
  }, []);

  const heroCourse = latestCourse ?? publishedCourses[0] ?? null;
  const heroTitle = heroCourse?.title ?? 'Empowering the next generation of thinkers.';
  const heroSubtitle = heroCourse?.subtitle || heroCourse?.description || '"Education is the most powerful weapon which you can use to change the world."';
  const heroImage = heroCourse?.image ?? 'https://picsum.photos/seed/learning/1920/1080';
  const heroLink = heroCourse ? `/course/${heroCourse.id}` : '/browse';
  const heroCategory = heroCourse?.category ?? 'New Release';

  return (
    <div className="space-y-16">
      <section className="relative h-[500px] rounded-3xl overflow-hidden bg-slate-900 flex items-center px-12">
        <div className="absolute inset-0 opacity-40">
          <img 
            src={heroImage}
            alt={heroCourse?.title ?? 'Hero'} 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/80 to-transparent" />
        </div>
        
        <div className="relative z-10 max-w-2xl space-y-6">
          <motion.span 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-full uppercase tracking-widest"
          >
            {heroCategory}
          </motion.span>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl font-bold text-white leading-tight"
          >
            {heroTitle}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-slate-300 italic"
          >
            {heroSubtitle}
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-4"
          >
            <Link to={heroLink} className="bg-white text-slate-900 px-8 py-3 rounded-xl font-bold hover:bg-indigo-50 transition-all flex items-center gap-2">
              View Course <ArrowRight className="w-4 h-4" />
            </Link>
            {heroCourse?.promoVideo ? (
              <a
                href={heroCourse.promoVideo}
                target="_blank"
                rel="noreferrer"
                className="text-white font-bold hover:text-indigo-400 transition-colors flex items-center gap-2"
              >
                <div className="w-10 h-10 rounded-full border border-white/30 flex items-center justify-center">
                  <Play className="w-4 h-4 fill-current" />
                </div>
                Watch Demo
              </a>
            ) : (
              <Link to="/browse" className="text-white font-bold hover:text-indigo-400 transition-colors flex items-center gap-2">
                <div className="w-10 h-10 rounded-full border border-white/30 flex items-center justify-center">
                  <Play className="w-4 h-4 fill-current" />
                </div>
                Explore Courses
              </Link>
            )}
          </motion.div>
        </div>
      </section>

      <section className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Recommended for You</h2>
            <p className="text-slate-500">Based on your interests and learning history.</p>
          </div>
          <Link to="/browse" className="text-indigo-600 font-bold flex items-center gap-1 hover:gap-2 transition-all">
            View all <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {recommendedCourses.slice(0, 3).map((course, idx) => (
            <motion.div 
              key={course.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 transition-all"
            >
              <div className="aspect-video relative overflow-hidden">
                <img src={course.image} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute top-4 left-4">
                  <span className="px-3 py-1 bg-white/90 backdrop-blur text-[10px] font-bold uppercase tracking-wider rounded-md text-slate-900">
                    {course.category}
                  </span>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
                  <Star className="w-3 h-3 fill-current" />
                  <span>{course.rating}</span>
                  <span className="text-slate-400 font-medium">({course.studentsCount.toLocaleString()} students)</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2">{course.title}</h3>
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <Link 
                    to={`/course/${course.id}`}
                    className="w-full bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition-all text-center"
                  >
                    View Course
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 rounded-3xl p-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-2">
          <h4 className="text-3xl font-bold text-slate-900">{formatStatCount(stats.activeStudents)}</h4>
          <p className="text-sm text-slate-500 font-medium">Active Students</p>
        </div>
        <div className="space-y-2">
          <h4 className="text-3xl font-bold text-slate-900">{formatStatCount(stats.expertInstructors)}</h4>
          <p className="text-sm text-slate-500 font-medium">Expert Instructors</p>
        </div>
        <div className="space-y-2">
          <h4 className="text-3xl font-bold text-slate-900">{formatStatCount(stats.totalCourses)}</h4>
          <p className="text-sm text-slate-500 font-medium">Total Courses</p>
        </div>
        <div className="space-y-2">
          <h4 className="text-3xl font-bold text-slate-900">{stats.avgRating.toFixed(1)}</h4>
          <p className="text-sm text-slate-500 font-medium">Average Rating</p>
        </div>
      </section>
    </div>
  );
};
