import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { StudentSidebar } from './components/StudentSidebar';
import { PublicOnly, RequireAuth } from './auth/RouteGuards';

// Admin Pages
import { AdminDashboard } from './pages/admin/Dashboard';
import { CourseCreator } from './pages/admin/CourseCreator';
import { AdminCourses } from './pages/admin/Courses';
import { AdminCourseOverview } from './pages/admin/CourseOverview';
import { LessonEditor } from './pages/admin/LessonEditor';
import { AdminPerformance } from './pages/admin/Performance';
import { AdminEnrollments } from './pages/admin/Enrollments';
import { AdminStudentList } from './pages/admin/StudentList';
import { AdminProfile } from './pages/admin/Resources';
import { AdminManagement } from './pages/admin/AdminManagement';

// Student Pages
import { LandingPage } from './pages/Landing';
import { StudentHome } from './pages/student/Home';
import { MyLearnings } from './pages/student/MyLearnings';
import { CoursePlayer } from './pages/student/CoursePlayer';
import { CourseOutline } from './pages/student/CourseOutline';
import { BrowseCourses } from './pages/student/Browse';
import { CourseDetails } from './pages/student/CourseDetails';
import { StudentProfile } from './pages/student/Profile';
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
  <div className="flex min-h-screen bg-slate-50">
    <StudentSidebar />
    <main className="flex-1 p-8 overflow-y-auto">
      {children}
    </main>
  </div>
);

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Admin Routes */}
        <Route
          path="/admin"
          element={(
            <RequireAuth allowedRoles={['Admin']}>
              <AdminLayout><AdminDashboard /></AdminLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/courses"
          element={(
            <RequireAuth allowedRoles={['Admin']}>
              <AdminLayout><AdminCourses /></AdminLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/courses/new"
          element={(
            <RequireAuth allowedRoles={['Admin']}>
              <AdminLayout><CourseCreator /></AdminLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/courses/:id/overview"
          element={(
            <RequireAuth allowedRoles={['Admin']}>
              <AdminLayout><AdminCourseOverview /></AdminLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/courses/:id"
          element={(
            <RequireAuth allowedRoles={['Admin']}>
              <AdminLayout><CourseCreator /></AdminLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/courses/:courseId/sections/:sectionId/lectures/:lectureId/edit"
          element={(
            <RequireAuth allowedRoles={['Admin']}>
              <AdminLayout><LessonEditor /></AdminLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/performance"
          element={(
            <RequireAuth allowedRoles={['Admin']}>
              <AdminLayout><AdminPerformance /></AdminLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/enrollments"
          element={(
            <RequireAuth allowedRoles={['Admin']}>
              <AdminLayout><AdminEnrollments /></AdminLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/students"
          element={(
            <RequireAuth allowedRoles={['Admin']}>
              <AdminLayout><AdminStudentList /></AdminLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/admins"
          element={(
            <RequireAuth allowedRoles={['Admin']}>
              <AdminLayout><AdminManagement /></AdminLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/profile"
          element={(
            <RequireAuth allowedRoles={['Admin']}>
              <AdminLayout><AdminProfile /></AdminLayout>
            </RequireAuth>
          )}
        />
        
        {/* Student Routes */}
        <Route
          path="/"
          element={<LandingPage />}
        />
        <Route
          path="/home"
          element={(
            <RequireAuth allowedRoles={['Student', 'Admin']}>
              <StudentLayout><StudentHome /></StudentLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/my-learnings"
          element={(
            <RequireAuth allowedRoles={['Student', 'Admin']}>
              <StudentLayout><MyLearnings /></StudentLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/browse"
          element={(
            <RequireAuth allowedRoles={['Student', 'Admin']}>
              <StudentLayout><BrowseCourses /></StudentLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/profile"
          element={(
            <RequireAuth allowedRoles={['Student', 'Admin']}>
              <StudentLayout><StudentProfile /></StudentLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/course/:id"
          element={(
            <RequireAuth allowedRoles={['Student', 'Admin']}>
              <StudentLayout><CourseDetails /></StudentLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/course/:id/learn"
          element={(
            <RequireAuth allowedRoles={['Student', 'Admin']}>
              <StudentLayout><CourseOutline /></StudentLayout>
            </RequireAuth>
          )}
        />
        <Route
          path="/course/:id/learn/lectures/:lectureId"
          element={(
            <RequireAuth allowedRoles={['Student', 'Admin']}>
              <CoursePlayer />
            </RequireAuth>
          )}
        />
        
        {/* Auth Routes */}
        <Route
          path="/login"
          element={(
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          )}
        />
        <Route
          path="/register"
          element={(
            <PublicOnly>
              <RegisterPage />
            </PublicOnly>
          )}
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
