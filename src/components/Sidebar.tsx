import React from 'react';
import { LayoutDashboard, BookOpen, BarChart3, ClipboardList, Shield, UserCircle2, LogOut, Users } from 'lucide-react';
import { cn } from '../utils';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
  { icon: BookOpen, label: 'Courses', path: '/admin/courses' },
  { icon: BarChart3, label: 'Performance', path: '/admin/performance' },
  { icon: ClipboardList, label: 'Enrollment List', path: '/admin/enrollments' },
  { icon: Users, label: 'Student List', path: '/admin/students' },
  { icon: Shield, label: 'Admin', path: '/admin/admins' },
  { icon: UserCircle2, label: 'Profile', path: '/admin/profile' },
];

export const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="w-64 border-r border-slate-200 bg-white h-screen flex flex-col sticky top-0">
      <div className="p-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <BookOpen className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-900">EduFlow</span>
        </div>
        {user ? (
          <div className="px-1">
            <p className="text-sm font-semibold text-slate-800">{user.name}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = item.path === '/admin/courses'
            ? location.pathname.startsWith('/admin/courses')
            : location.pathname === item.path;
          return (
            <Link
              key={item.label}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive 
                  ? "bg-indigo-50 text-indigo-600" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-100 space-y-1">
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 w-full"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
};
