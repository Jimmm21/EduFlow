import React, { useEffect, useMemo, useState } from 'react';
import { Search, Filter, Star, ChevronDown, Heart } from 'lucide-react';
import { MOCK_COURSES, MOCK_STUDENT_COURSE_PROGRESS } from '../../mockData';
import { CATEGORIES, LEVELS, cn } from '../../utils';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import type { Course } from '../../types';
import { fetchPublicCourses } from '../../lib/courseApi';

const fallbackCourses = MOCK_COURSES.filter(
  (course) => course.status === 'Published' && course.visibility === 'Public',
);

export const BrowseCourses = () => {
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(() => new Set());
  const [selectedRatings, setSelectedRatings] = useState<Set<number>>(() => new Set());
  const [courses, setCourses] = useState<Course[]>(fallbackCourses);
  const [isLoading, setIsLoading] = useState(true);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(
    () =>
      new Set(
        MOCK_STUDENT_COURSE_PROGRESS
          .filter((item) => item.status === 'wishlist')
          .map((item) => item.courseId),
      ),
  );

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const publicCourses = await fetchPublicCourses();
        setCourses(publicCourses);
      } catch {
        setCourses(fallbackCourses);
      } finally {
        setIsLoading(false);
      }
    };

    loadCourses();
  }, []);

  const filteredCourses = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const normalizedLevels = Array.from(selectedLevels);
    const hasLevelFilter = normalizedLevels.length > 0;
    const minRatingFilter = selectedRatings.size > 0 ? Math.min(...Array.from(selectedRatings)) : null;

    return courses.filter((course) => {
      const matchesCategory = selectedCategory === 'All Categories' || course.category === selectedCategory;
      if (!matchesCategory) {
        return false;
      }

      if (hasLevelFilter) {
        const allowsAllLevels = selectedLevels.has('All Levels');
        const matchesSpecificLevel = selectedLevels.has(course.level);
        const matchesAllLevelsCourse = course.level === 'All Levels';

        if (!(allowsAllLevels || matchesSpecificLevel || matchesAllLevelsCourse)) {
          return false;
        }
      }

      if (minRatingFilter !== null) {
        if (course.rating < minRatingFilter) {
          return false;
        }
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        course.title,
        course.subtitle,
        course.description,
        course.category,
        course.level,
        course.language,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [courses, searchQuery, selectedCategory, selectedLevels, selectedRatings]);

  const toggleWishlist = (courseId: string) => {
    setWishlistIds((previous) => {
      const next = new Set(previous);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  const toggleLevelFilter = (level: string) => {
    setSelectedLevels((previous) => {
      const next = new Set(previous);
      if (next.has(level)) {
        next.delete(level);
      } else {
        if (level === 'All Levels') {
          next.clear();
        }
        next.add(level);
      }

      if (next.has('All Levels') && next.size > 1) {
        next.delete('All Levels');
      }

      return next;
    });
  };

  const toggleRatingFilter = (rating: number) => {
    setSelectedRatings((previous) => {
      const next = new Set(previous);
      if (next.has(rating)) {
        next.delete(rating);
      } else {
        next.add(rating);
      }
      return next;
    });
  };

  return (
    <div className="space-y-12">
      <header className="space-y-6">
        <h1 className="text-4xl font-bold text-slate-900">Explore Courses</h1>
        <p className="max-w-2xl text-slate-500">Discover your next skill from our library of courses taught by industry experts.</p>

        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="What do you want to learn today?"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-4 shadow-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setSearchQuery((previous) => previous.trim())}
            className="rounded-2xl bg-indigo-600 px-8 py-4 font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700"
          >
            Search
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-4">
        <aside className="space-y-8">
          <div>
            <h3 className="mb-4 flex items-center justify-between font-bold text-slate-900">
              Categories
              <Filter className="h-4 w-4 text-slate-400" />
            </h3>
            <div className="space-y-1">
              {['All Categories', ...CATEGORIES].map((categoryName) => (
                <button
                  key={categoryName}
                  onClick={() => setSelectedCategory(categoryName)}
                  className={cn(
                    'w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-all',
                    selectedCategory === categoryName
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  {categoryName}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-4 font-bold text-slate-900">Level</h3>
            <div className="space-y-2">
              {LEVELS.map((level) => (
                <label key={level} className="group flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedLevels.has(level)}
                    onChange={() => toggleLevelFilter(level)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900">{level}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-4 font-bold text-slate-900">Rating</h3>
            <div className="space-y-2">
              {[4.5, 4.0, 3.5].map((rating) => (
                <label key={rating} className="group flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedRatings.has(rating)}
                    onChange={() => toggleRatingFilter(rating)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex items-center gap-1 text-sm text-slate-600 group-hover:text-slate-900">
                    <Star className="h-3 w-3 fill-current text-amber-500" />
                    <span>{rating} &amp; up</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </aside>

        <main className="space-y-8 lg:col-span-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              {isLoading ? 'Loading courses...' : `Showing ${filteredCourses.length} course${filteredCourses.length === 1 ? '' : 's'}`}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Sort by:</span>
              <button className="flex items-center gap-1 text-sm font-bold text-slate-900">
                Most Popular <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {filteredCourses.length === 0 && !isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
              <h3 className="mb-2 text-lg font-bold text-slate-900">No published courses found</h3>
              <p className="text-slate-500">Published public courses will appear here once an admin makes them available.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {filteredCourses.map((course) => (
                <motion.div
                  key={course.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:shadow-xl hover:shadow-slate-200/50"
                >
                  <div className="relative aspect-video overflow-hidden">
                    <img src={course.image} alt={course.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="rounded bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                          {course.category}
                        </span>
                        <div className="flex items-center gap-1 text-xs font-bold text-amber-500">
                          <Star className="h-3 w-3 fill-current" />
                          <span>{course.rating > 0 ? course.rating.toFixed(1) : 'New'}</span>
                        </div>
                      </div>
                      <h3 className="line-clamp-2 font-bold text-slate-900 transition-colors group-hover:text-indigo-600">{course.title}</h3>
                      <p className="line-clamp-2 text-sm text-slate-500">{course.subtitle}</p>
                    </div>
                    <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-6">
                      <button
                        type="button"
                        onClick={() => toggleWishlist(course.id)}
                        aria-label={wishlistIds.has(course.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                        title={wishlistIds.has(course.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                        className={cn(
                          'inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors',
                          wishlistIds.has(course.id)
                            ? 'border-rose-200 bg-rose-50 text-rose-500'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500',
                        )}
                      >
                        <Heart className={cn('h-4 w-4', wishlistIds.has(course.id) ? 'fill-current' : '')} />
                      </button>
                      <Link
                        to={`/course/${course.id}`}
                        className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-bold text-white transition-all hover:bg-indigo-600"
                      >
                        View Course
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
