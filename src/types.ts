export type CourseLevel = 'Beginner' | 'Intermediate' | 'Expert' | 'All Levels';
export type CourseCategory = 'Development' | 'Business' | 'IT & Software' | 'Design' | 'Marketing' | 'Photography';
export type ContentType = 'Video' | 'Article' | 'Quiz';

export interface Lecture {
  id: string;
  title: string;
  type: ContentType;
  duration?: string;
  content?: string;
  videoUrl?: string;
  isCompleted?: boolean;
}

export interface Section {
  id: string;
  title: string;
  lectures: Lecture[];
}

export interface Course {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  language: string;
  level: CourseLevel;
  category: CourseCategory;
  image: string;
  promoVideo?: string;
  targetStudents: string[];
  sections: Section[];
  status: 'Draft' | 'Published';
  enrollmentStatus: 'Open' | 'Closed';
  visibility: 'Public' | 'Private';
  studentsCount: number;
  rating: number;
  lastUpdated: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Student';
  avatar?: string;
}
