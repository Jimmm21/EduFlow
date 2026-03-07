import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { User } from '../types';
import { defaultRouteForRole, useAuth } from './AuthContext';

interface RequireAuthProps {
  children: React.ReactNode;
  allowedRoles?: User['role'][];
}

const buildLoginRedirectPath = (pathname: string, search: string, hash: string) => {
  const nextPath = `${pathname}${search}${hash}`;
  return `/login?redirect=${encodeURIComponent(nextPath)}`;
};

export const RequireAuth = ({ children, allowedRoles }: RequireAuthProps) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to={buildLoginRedirectPath(location.pathname, location.search, location.hash)} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={defaultRouteForRole(user.role)} replace />;
  }

  return <>{children}</>;
};

export const PublicOnly = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();

  if (user) {
    return <Navigate to={defaultRouteForRole(user.role)} replace />;
  }

  return <>{children}</>;
};
