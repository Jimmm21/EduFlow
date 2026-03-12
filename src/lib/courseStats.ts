import type { Course } from '../types';

export type CourseStats = {
  activeStudents: number;
  expertInstructors: number;
  totalCourses: number;
  coursesLaunched: number;
  avgRating: number;
};

const formatShortNumber = (value: number) => {
  if (value >= 1_000_000) {
    const formatted = (value / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted}M+`;
  }
  if (value >= 1_000) {
    const formatted = (value / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted}K+`;
  }
  return `${value}`;
};

export const formatStatCount = (value: number) => formatShortNumber(Math.max(0, Math.round(value)));

export const buildCourseStats = (courses: Course[]): CourseStats => {
  const publishedCourses = courses.filter((course) => course.status === 'Published' && course.visibility === 'Public');
  const totalCourses = publishedCourses.length;
  if (totalCourses === 0) {
    return {
      activeStudents: 0,
      expertInstructors: 0,
      totalCourses: 0,
      coursesLaunched: 0,
      avgRating: 0,
    };
  }

  const activeStudents = publishedCourses.reduce((total, course) => total + (course.studentsCount || 0), 0);
  const ratedCourses = publishedCourses.filter((course) => (course.rating ?? 0) > 0);
  const avgRating = ratedCourses.length
    ? ratedCourses.reduce((total, course) => total + (course.rating ?? 0), 0) / ratedCourses.length
    : 0;

  const expertInstructors = totalCourses;
  const coursesLaunched = totalCourses;

  return {
    activeStudents,
    expertInstructors,
    totalCourses,
    coursesLaunched,
    avgRating: Math.round(avgRating * 10) / 10,
  };
};
