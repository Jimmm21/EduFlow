import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';

// Admin Pages
import { AdminDashboard } from './pages/admin/Dashboard';
import { CourseCreator } from './pages/admin/CourseCreator';

// Student Pages
import { StudentHome } from './pages/student/Home';
import { MyLearnings } from './pages/student/MyLearnings';
import { CoursePlayer } from './pages/student/CoursePlayer';
import { BrowseCourses } from './pages/student/Browse';
import { CourseDetails } from './pages/student/CourseDetails';
import { LoginPage } from './pages/auth/Login';
import { RegisterPage } from './pages/auth/Register';

const AdminLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen bg-slate-50">
    <Sidebar />
    <main className="flex-1 p-8 overflow-y-auto">
      {children}
    </main>
  </div>
);

const StudentLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-white">
    <Navbar />
    <main className="max-w-7xl mx-auto px-4 py-8">
      {children}
    </main>
  </div>
);

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Admin Routes */}
        <Route path="/admin" element={<AdminLayout><AdminDashboard /></AdminLayout>} />
        <Route path="/admin/courses/new" element={<AdminLayout><CourseCreator /></AdminLayout>} />
        <Route path="/admin/courses/:id" element={<AdminLayout><CourseCreator /></AdminLayout>} />
        
        {/* Student Routes */}
        <Route path="/" element={<StudentLayout><StudentHome /></StudentLayout>} />
        <Route path="/my-learnings" element={<StudentLayout><MyLearnings /></StudentLayout>} />
        <Route path="/browse" element={<StudentLayout><BrowseCourses /></StudentLayout>} />
        <Route path="/course/:id" element={<StudentLayout><CourseDetails /></StudentLayout>} />
        <Route path="/course/:id/learn" element={<CoursePlayer />} />
        
        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
