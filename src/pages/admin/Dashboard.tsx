import React from 'react';
import { Users, DollarSign, Star, Plus, MoreVertical, ExternalLink } from 'lucide-react';
import { MOCK_COURSES, MOCK_USER } from '../../mockData';
import { cn } from '../../utils';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';

const StatCard = ({ icon: Icon, label, value, trend, trendType }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
        <Icon className="w-5 h-5 text-slate-600" />
      </div>
      {trend && (
        <span className={cn(
          "text-xs font-semibold px-2 py-1 rounded-full",
          trendType === 'up' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
        )}>
          {trend}
        </span>
      )}
    </div>
    <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
    <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
  </div>
);

export const AdminDashboard = () => {
  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {MOCK_USER.name.split(' ')[0]}</h1>
          <p className="text-slate-500">Check your course stats and manage your students.</p>
        </div>
        <Link 
          to="/admin/courses/new"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-200 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Create Your Course
        </Link>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          icon={Users} 
          label="Total Enrollments" 
          value="12,482" 
          trend="+12% increase" 
          trendType="up" 
        />
        <StatCard 
          icon={BookOpen} 
          label="Active Courses" 
          value="3" 
        />
        <StatCard 
          icon={Star} 
          label="Average Rating" 
          value="4.8" 
        />
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">My Courses</h2>
          <button className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">View all</button>
        </div>
        <div className="divide-y divide-slate-100">
          {MOCK_COURSES.map((course) => (
            <motion.div 
              key={course.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 flex items-center gap-6 hover:bg-slate-50 transition-colors group"
            >
              <div className="w-24 h-16 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                <img src={course.image} alt={course.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">{course.title}</h3>
                <p className="text-sm text-slate-500">
                  Published on {course.lastUpdated} • {course.studentsCount.toLocaleString()} Students
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md",
                  course.status === 'Published' ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                )}>
                  {course.status}
                </span>
                <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-all">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
          <h3 className="font-bold text-indigo-900 mb-2">New Instructor Challenge</h3>
          <p className="text-sm text-indigo-700 mb-4">Join our 30-day challenge to launch your first course and get personalized feedback from top instructors.</p>
          <button className="text-sm font-bold text-indigo-600 flex items-center gap-1 hover:gap-2 transition-all">
            Learn more <ExternalLink className="w-3 h-3" />
          </button>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-slate-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Teaching Guide</h3>
            <p className="text-sm text-slate-500">Best practices for course creation and engagement.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const BookOpen = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 3h6a4 4 0 0 1 4 4v14a4 4 0 0 0-4-4H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a4 4 0 0 1 4-4h6z"/></svg>
);
