import React from 'react';
import { Search, Bell, ShoppingCart, User, BookOpen, Layout } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../utils';

export const Navbar = () => {
  const location = useLocation();

  return (
    <header className="h-16 border-b border-slate-200 bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between gap-8">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <BookOpen className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">EduFlow</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link 
              to="/my-learnings" 
              className={cn(
                "text-sm font-medium transition-colors",
                location.pathname === '/my-learnings' ? "text-indigo-600" : "text-slate-600 hover:text-slate-900"
              )}
            >
              My Learning
            </Link>
            <Link 
              to="/browse" 
              className={cn(
                "text-sm font-medium transition-colors",
                location.pathname === '/browse' ? "text-indigo-600" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Browse
            </Link>
            <Link to="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Instructor
            </Link>
          </nav>
        </div>

        <div className="flex-1 max-w-md hidden sm:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search for courses, skills, or authors..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent rounded-full text-sm focus:bg-white focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">
            Sign In
          </Link>
          <Link to="/register" className="hidden sm:block bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
            Get Started
          </Link>
          <div className="w-px h-6 bg-slate-200 mx-1" />
          <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-full">
            <Bell className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-slate-200 cursor-pointer">
            <img src="https://i.pravatar.cc/150?u=alex" alt="Profile" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>
    </header>
  );
};
