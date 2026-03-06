import React from 'react';
import { Play, Clock, CheckCircle2, Trophy, Flame } from 'lucide-react';
import { MOCK_COURSES } from '../../mockData';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

export const MyLearnings = () => {
  const myCourses = MOCK_COURSES.filter(c => c.status === 'Published');

  return (
    <div className="space-y-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Welcome back, Alex!</h1>
          <p className="text-slate-500">You're making great progress. You have 3 courses currently in progress.</p>
        </div>
        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Flame className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Streak</p>
              <p className="text-sm font-bold text-slate-900">5 Days</p>
            </div>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Trophy className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Points</p>
              <p className="text-sm font-bold text-slate-900">1,250</p>
            </div>
          </div>
        </div>
      </header>

      <section className="space-y-6">
        <div className="flex items-center gap-8 border-b border-slate-200">
          <button className="pb-4 text-sm font-bold text-indigo-600 border-b-2 border-indigo-600">All Courses</button>
          <button className="pb-4 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">In Progress</button>
          <button className="pb-4 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">Completed</button>
          <button className="pb-4 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">Wishlist</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {myCourses.map((course, idx) => {
            const progress = Math.floor(Math.random() * 100);
            return (
              <motion.div 
                key={course.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden group hover:shadow-xl hover:shadow-slate-200/50 transition-all"
              >
                <div className="aspect-video relative overflow-hidden">
                  <img src={course.image} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Link 
                      to={`/course/${course.id}/learn`}
                      className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-xl active:scale-90 transition-all"
                    >
                      <Play className="w-6 h-6 fill-current" />
                    </Link>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider rounded">
                      {course.category}
                    </span>
                    <span className="text-xs font-bold text-slate-400">{progress}% Complete</span>
                  </div>
                  <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">{course.title}</h3>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 1, delay: 0.5 }}
                      className="h-full bg-indigo-600 rounded-full"
                    />
                  </div>
                  <Link 
                    to={`/course/${course.id}/learn`}
                    className="w-full py-2.5 bg-slate-50 text-slate-900 text-sm font-bold rounded-xl hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2"
                  >
                    Resume Course
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
