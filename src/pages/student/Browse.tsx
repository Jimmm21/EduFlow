import React, { useState } from 'react';
import { Search, Filter, Star, ChevronDown } from 'lucide-react';
import { MOCK_COURSES } from '../../mockData';
import { CATEGORIES, LEVELS, cn } from '../../utils';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

export const BrowseCourses = () => {
  const [selectedCategory, setSelectedCategory] = useState('All Categories');

  return (
    <div className="space-y-12">
      <header className="space-y-6">
        <h1 className="text-4xl font-bold text-slate-900">Explore Courses</h1>
        <p className="text-slate-500 max-w-2xl">Discover your next skill from our library of 5,000+ courses taught by industry experts.</p>
        
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="What do you want to learn today?" 
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none shadow-sm"
            />
          </div>
          <button className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
            Search
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
        <aside className="space-y-8">
          <div>
            <h3 className="font-bold text-slate-900 mb-4 flex items-center justify-between">
              Categories
              <Filter className="w-4 h-4 text-slate-400" />
            </h3>
            <div className="space-y-1">
              {['All Categories', ...CATEGORIES].map((cat) => (
                <button 
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    selectedCategory === cat ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-4">Level</h3>
            <div className="space-y-2">
              {LEVELS.map((level) => (
                <label key={level} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900">{level}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-4">Rating</h3>
            <div className="space-y-2">
              {[4.5, 4.0, 3.5].map((rating) => (
                <label key={rating} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <div className="flex items-center gap-1 text-sm text-slate-600 group-hover:text-slate-900">
                    <Star className="w-3 h-3 text-amber-500 fill-current" />
                    <span>{rating} & up</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </aside>

        <main className="lg:col-span-3 space-y-8">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 font-medium">Showing 124 courses</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Sort by:</span>
              <button className="text-sm font-bold text-slate-900 flex items-center gap-1">
                Most Popular <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {MOCK_COURSES.filter(c => c.status === 'Published').map((course) => (
              <motion.div 
                key={course.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden group hover:shadow-xl hover:shadow-slate-200/50 transition-all flex flex-col"
              >
                <div className="aspect-video relative overflow-hidden">
                  <img src={course.image} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                        {course.category}
                      </span>
                      <div className="flex items-center gap-1 text-xs font-bold text-amber-500">
                        <Star className="w-3 h-3 fill-current" />
                        <span>{course.rating}</span>
                      </div>
                    </div>
                    <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2">{course.title}</h3>
                    <p className="text-sm text-slate-500 line-clamp-2">{course.subtitle}</p>
                  </div>
                  <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between">
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
        </main>
      </div>
    </div>
  );
};
