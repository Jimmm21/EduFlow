import React, { useState } from 'react';
import { Play, ChevronLeft, ChevronRight, CheckCircle2, Circle, Lock, Menu, X, Share2, MoreVertical, FileText, HelpCircle, Video } from 'lucide-react';
import { MOCK_COURSES } from '../../mockData';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils';

export const CoursePlayer = () => {
  const { id } = useParams();
  const course = MOCK_COURSES.find(c => c.id === id) || MOCK_COURSES[0];
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeLecture, setActiveLecture] = useState(course.sections[0]?.lectures[0]);

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white overflow-hidden">
      <header className="h-16 border-b border-white/10 px-4 flex items-center justify-between shrink-0 bg-slate-900 z-20">
        <div className="flex items-center gap-4">
          <Link to="/my-learnings" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold truncate max-w-xs">{course.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 w-1/3" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">35% Complete</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-bold hover:bg-white/10 rounded-xl transition-all">
            <Share2 className="w-4 h-4" />
            Share Course
          </button>
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col overflow-y-auto">
          <div className="aspect-video bg-black relative group">
            <img 
              src={course.image} 
              alt="Video Placeholder" 
              className="w-full h-full object-cover opacity-50"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <button className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center shadow-2xl shadow-indigo-500/50 hover:scale-110 active:scale-95 transition-all">
                <Play className="w-8 h-8 fill-current ml-1" />
              </button>
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button className="p-2 hover:bg-white/20 rounded-lg"><Play className="w-5 h-5 fill-current" /></button>
                  <div className="text-xs font-bold">12:45 / 32:10</div>
                </div>
                <div className="flex items-center gap-4">
                  <button className="px-2 py-1 text-[10px] font-bold border border-white/30 rounded hover:bg-white/10">1.25x</button>
                  <button className="p-2 hover:bg-white/20 rounded-lg"><MoreVertical className="w-5 h-5" /></button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 max-w-4xl mx-auto w-full space-y-8">
            <div className="flex items-center gap-4 border-b border-white/10 pb-4">
              <button className="text-sm font-bold text-indigo-400 border-b-2 border-indigo-400 pb-4">Overview</button>
              <button className="text-sm font-bold text-slate-400 hover:text-white transition-colors pb-4">Resources</button>
              <button className="text-sm font-bold text-slate-400 hover:text-white transition-colors pb-4">Q&A</button>
              <button className="text-sm font-bold text-slate-400 hover:text-white transition-colors pb-4">Notes</button>
              <button className="text-sm font-bold text-slate-400 hover:text-white transition-colors pb-4">Reviews</button>
            </div>

            <div className="space-y-6">
              <h2 className="text-3xl font-bold">{activeLecture?.title || 'Introduction to Server Components'}</h2>
              <p className="text-slate-400 leading-relaxed">
                In this lecture, we dive deep into the architecture of React Server Components (RSC). We'll explore why they were introduced, how they differ from client components, and the performance benefits of moving rendering logic to the server.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-start gap-4">
                  <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">Course Materials</h4>
                    <p className="text-xs text-slate-500 mt-1">Lecture slides and starter code included in Resources tab.</p>
                  </div>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-start gap-4">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">Certificate</h4>
                    <p className="text-xs text-slate-500 mt-1">Finish all lectures to unlock your verifiable certificate.</p>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-white/10">
                <h3 className="font-bold mb-4">Instructor</h3>
                <div className="flex items-center gap-4">
                  <img src="https://i.pravatar.cc/150?u=sarah" alt="Instructor" className="w-12 h-12 rounded-full border border-white/10" />
                  <div>
                    <h4 className="font-bold">Dr. Sarah Johnson</h4>
                    <p className="text-xs text-slate-500">Full Stack Web Developer & Lead Instructor</p>
                  </div>
                  <button className="ml-auto px-4 py-2 text-xs font-bold border border-white/20 rounded-xl hover:bg-white/10 transition-all">Follow</button>
                </div>
              </div>
            </div>
          </div>
        </main>

        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l border-white/10 bg-slate-900 flex flex-col shrink-0 overflow-hidden"
            >
              <div className="p-6 border-b border-white/10">
                <h3 className="font-bold">Course Content</h3>
              </div>
              <div className="flex-1 overflow-y-auto">
                {course.sections.map((section, sIdx) => (
                  <div key={section.id} className="border-b border-white/5">
                    <div className="p-4 bg-white/5 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Section {sIdx + 1}: {section.title}</h4>
                        <p className="text-[10px] text-slate-500 mt-1">{section.lectures.length} Lectures • 45min</p>
                      </div>
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="divide-y divide-white/5">
                      {section.lectures.map((lecture, lIdx) => {
                        const isActive = activeLecture?.id === lecture.id;
                        return (
                          <button 
                            key={lecture.id}
                            onClick={() => setActiveLecture(lecture)}
                            className={cn(
                              "w-full text-left p-4 flex items-start gap-3 transition-colors",
                              isActive ? "bg-indigo-600/20 border-l-4 border-indigo-500" : "hover:bg-white/5"
                            )}
                          >
                            <div className="mt-0.5">
                              {lIdx === 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-slate-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className={cn("text-sm font-medium truncate", isActive ? "text-indigo-400" : "text-slate-300")}>
                                {lIdx + 1}. {lecture.title}
                              </h5>
                              <div className="flex items-center gap-2 mt-1">
                                {lecture.type === 'Video' ? <Video className="w-3 h-3 text-slate-500" /> : <FileText className="w-3 h-3 text-slate-500" />}
                                <span className="text-[10px] text-slate-500">{lecture.duration || '5 min'}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-white/10">
                <button className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Get Support
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const ChevronDown = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6"/></svg>
);

const Trophy = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
);
