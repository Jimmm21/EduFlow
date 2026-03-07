import React from 'react';
import { cn } from '../utils';

interface UserAvatarProps {
  name: string;
  src?: string;
  className?: string;
  textClassName?: string;
}

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';

export const UserAvatar = ({ name, src, className, textClassName }: UserAvatarProps) => {
  if (src) {
    return (
      <div className={cn('overflow-hidden rounded-full bg-slate-200', className)}>
        <img src={src} alt={`${name} avatar`} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-slate-900 font-semibold text-white',
        className,
      )}
      aria-label={`${name} avatar`}
    >
      <span className={textClassName}>{getInitials(name)}</span>
    </div>
  );
};
