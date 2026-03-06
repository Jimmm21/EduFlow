import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CATEGORIES = [
  'Development',
  'Business',
  'IT & Software',
  'Design',
  'Marketing',
  'Photography',
];

export const LEVELS = ['Beginner', 'Intermediate', 'Expert', 'All Levels'];

export const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese'];
