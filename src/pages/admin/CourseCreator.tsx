import React, { useState } from 'react';
import { ChevronLeft, Save, Eye, Plus, Video, FileText, HelpCircle, Trash2, GripVertical, CheckCircle2, Circle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CATEGORIES, LEVELS, LANGUAGES, cn } from '../../utils';
import { Section, Lecture } from '../../types';

const steps = [
  { id: 1, label: 'Course Landing Page' },
  { id: 2, label: 'Curriculum' },
  { id: 3, label: 'Target Students' },
  { id: 4, label: 'Settings' },
];

export const CourseCreator = () => {
  const { id } = useParams();
  const [activeStep, setActiveStep] = useState(1);
  const [sections, setSections] = useState<Section[]>([
    {
      id: 's1',
      title: 'Introduction to the Course',
      lectures: [
        { id: 'l1', title: 'Welcome and Course Overview', type: 'Video', duration: '05:40' },
        { id: 'l2', title: 'Resources and Materials', type: 'Article' },
      ],
    },
  ]);

  const addSection = () => {
    const newSection: Section = {
      id: `s${Date.now()}`,
      title: 'New Section',
      lectures: [],
    };
    setSections([...sections, newSection]);
  };

  const addLecture = (sectionId: string) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          lectures: [...s.lectures, { id: `l${Date.now()}`, title: 'New Lecture', type: 'Video' }]
        };
      }
      return s;
    }));
  };

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{id ? 'Edit Course' : 'Create New Course'}</h1>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Draft Saved</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
            Preview
          </button>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-200 active:scale-95">
            Save and Continue
          </button>
        </div>
      </header>

      <nav className="flex items-center justify-between border-b border-slate-200 mb-8">
        {steps.map((step) => (
          <button
            key={step.id}
            onClick={() => setActiveStep(step.id)}
            className={cn(
              "px-4 py-4 text-sm font-semibold border-b-2 transition-all",
              activeStep === step.id 
                ? "border-indigo-600 text-indigo-600" 
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            {step.id}. {step.label}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1 space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Course Builder</h3>
            <nav className="space-y-1">
              {['Landing Page Info', 'Course Image', 'Promotional Video', 'Target Students'].map((item) => (
                <button key={item} className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                  {item}
                </button>
              ))}
            </nav>
          </div>
          <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
            <h4 className="text-sm font-bold text-indigo-900 mb-2">Tips for success</h4>
            <p className="text-xs text-indigo-700 leading-relaxed">
              Your course landing page is crucial for conversions. Make sure to use keywords and a compelling title.
            </p>
          </div>
        </aside>

        <main className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {activeStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-8"
              >
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Course Landing Page</h2>
                  <p className="text-slate-500">Your landing page is how students find and decide to buy your course.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Course Title</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Master React and Tailwind CSS from scratch" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                    />
                    <p className="text-xs text-slate-400">Your title should be a mix of attention-grabbing and informative. (Max 60 characters)</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Course Subtitle</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Build real-world projects and master modern frontend development" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Language</label>
                      <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none">
                        {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Level</label>
                      <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none">
                        {LEVELS.map(l => <option key={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Category</label>
                      <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none">
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Course Image</label>
                      <div className="aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 transition-all">
                        <Plus className="w-8 h-8 text-slate-300" />
                        <span className="text-xs font-bold text-slate-400">Upload Image</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Promotional Video</label>
                      <div className="aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 transition-all">
                        <Video className="w-8 h-8 text-slate-300" />
                        <span className="text-xs font-bold text-slate-400">Upload Video</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-1">Curriculum</h2>
                    <p className="text-slate-500">Start putting together your course by creating sections and lectures.</p>
                  </div>
                  <button 
                    onClick={addSection}
                    className="bg-slate-900 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-800 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Add Section
                  </button>
                </div>

                {sections.map((section, sIdx) => (
                  <div key={section.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <GripVertical className="w-4 h-4 text-slate-300" />
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Section {sIdx + 1}:</span>
                        <input 
                          type="text" 
                          defaultValue={section.title}
                          className="font-bold text-slate-900 bg-transparent border-none focus:ring-0 p-0"
                        />
                      </div>
                      <button className="p-2 text-slate-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4 space-y-3">
                      {section.lectures.map((lecture, lIdx) => (
                        <div key={lecture.id} className="flex items-center gap-4 p-4 border border-slate-100 rounded-xl hover:border-indigo-200 transition-all group">
                          <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400" />
                          <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                            {lecture.type === 'Video' ? <Video className="w-4 h-4 text-indigo-600" /> : <FileText className="w-4 h-4 text-indigo-600" />}
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-bold text-slate-900">{lIdx + 1}. {lecture.title}</h4>
                            {lecture.duration && <span className="text-xs text-slate-400">{lecture.duration}</span>}
                          </div>
                          <button className="px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                            Edit Content
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={() => addLecture(section.id)}
                        className="w-full py-3 border-2 border-dashed border-slate-100 rounded-xl text-sm font-bold text-slate-400 hover:border-indigo-200 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add Lecture
                      </button>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {activeStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-8"
              >
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Target Students</h2>
                  <p className="text-slate-500">Define who this course is for to help students find the right content.</p>
                </div>
                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-700">What will students learn in your course?</label>
                  <textarea 
                    placeholder="Example: Build a full-stack application from scratch..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none min-h-[150px]"
                  />
                </div>
              </motion.div>
            )}

            {activeStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-8"
              >
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Settings</h2>
                  <p className="text-slate-500">Manage visibility, enrollment, and automated messages.</p>
                </div>
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div>
                      <h4 className="font-bold text-slate-900">Course Visibility</h4>
                      <p className="text-xs text-slate-500">Public courses are searchable by everyone.</p>
                    </div>
                    <div className="flex bg-white p-1 rounded-lg border border-slate-200">
                      <button className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-md">Public</button>
                      <button className="px-3 py-1.5 text-xs font-bold text-slate-600">Private</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div>
                      <h4 className="font-bold text-slate-900">Enrollment Status</h4>
                      <p className="text-xs text-slate-500">Open for new students to join.</p>
                    </div>
                    <div className="flex bg-white p-1 rounded-lg border border-slate-200">
                      <button className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-md">Open</button>
                      <button className="px-3 py-1.5 text-xs font-bold text-slate-600">Closed</button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

const DollarSign = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
);
