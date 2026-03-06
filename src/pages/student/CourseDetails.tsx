import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { MOCK_COURSES } from '../../mockData';
import { Star, Clock, Globe, Users, Calendar, Check, ChevronDown, PlayCircle } from 'lucide-react';
import { motion } from 'motion/react';

export const CourseDetails = () => {
  const { id } = useParams();
  const course = MOCK_COURSES.find(c => c.id === id) || MOCK_COURSES[0];

  return (
    <div className="bg-white min-h-screen">
      {/* Hero Section */}
      <section className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-6">
            <nav className="flex items-center gap-2 text-sm font-medium text-indigo-400">
              <Link to="/browse" className="hover:underline">Development</Link>
              <span className="text-slate-600">/</span>
              <Link to="/browse" className="hover:underline">{course.category}</Link>
            </nav>
            
            <h1 className="text-4xl font-bold leading-tight">{course.title}</h1>
            <p className="text-xl text-slate-300">{course.subtitle}</p>
            
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div className="flex items-center gap-1 text-amber-400 font-bold">
                <span>{course.rating}</span>
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < Math.floor(course.rating) ? 'fill-current' : ''}`} />
                  ))}
                </div>
                <span className="text-indigo-400 underline ml-1">(12,450 ratings)</span>
              </div>
              <div className="text-slate-300">
                <span className="font-bold text-white">{course.studentsCount.toLocaleString()}</span> students
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>Created by <span className="text-indigo-400 underline font-bold">Dr. Sarah Johnson</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Last updated {course.lastUpdated}</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                <span>{course.language}</span>
              </div>
            </div>
          </div>

          {/* Floating Card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden sticky top-24">
              <div className="aspect-video relative group cursor-pointer">
                <img src={course.image} alt={course.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
                  <PlayCircle className="w-16 h-16 text-white" />
                  <span className="text-white font-bold">Preview this course</span>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <button className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95">
                  Enroll Course Now
                </button>
                <div className="text-center">
                  <p className="text-xs text-slate-500 font-medium">30-Day Money-Back Guarantee</p>
                </div>
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900">This course includes:</h4>
                  <ul className="space-y-2">
                    {[
                      '63 hours on-demand video',
                      '421 downloadable resources',
                      'Full lifetime access',
                      'Access on mobile and TV',
                      'Certificate of completion'
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-slate-600">
                        <Check className="w-4 h-4 text-slate-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="max-w-7xl mx-auto px-4 py-16 grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-12">
          {/* What you'll learn */}
          <div className="p-8 border border-slate-200 rounded-2xl bg-slate-50/50">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">What you'll learn</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                'Build 16 web development projects for your portfolio',
                'Learn the latest technologies, including React and Node.js',
                'Master both Front-End and Back-End development',
                'Work as a freelance web developer and start earning',
                'Master professional tools like Git and GitHub',
                'Deploy your applications to production environments'
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 text-sm text-slate-600">
                  <Check className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Course Content */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Course content</h2>
              <button className="text-sm font-bold text-indigo-600">Expand all sections</button>
            </div>
            <p className="text-sm text-slate-500">35 sections • 421 lectures • 63h 42m total length</p>
            
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-200">
              {course.sections.map((section, idx) => (
                <div key={section.id} className="bg-white">
                  <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                      <span className="font-bold text-slate-900">{section.title}</span>
                    </div>
                    <span className="text-sm text-slate-500">{section.lectures.length} lectures • 25min</span>
                  </div>
                </div>
              ))}
              <div className="p-4 text-center">
                <button className="text-sm font-bold text-slate-600 hover:text-indigo-600">28 more sections</button>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">Description</h2>
            <div className="text-slate-600 space-y-4 text-sm leading-relaxed">
              <p>Welcome to the Complete Full-Stack Web Development Bootcamp, the only course you need to learn to code and become a full-stack web developer. With over 60 hours of content, this web development course is without a doubt the most comprehensive web development course available online.</p>
              <p>Even if you have zero programming experience, this course will take you from beginner to mastery. Here's why:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>The course is taught by a world-class instructor from a top technical university.</li>
                <li>We've helped over 100,000 students learn to code and change their lives.</li>
                <li>We constantly update the course with new content and projects.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
