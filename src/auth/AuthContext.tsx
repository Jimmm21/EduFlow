import React, { createContext, useContext, useMemo, useState } from 'react';
import type { User } from '../types';
import { API_BASE_URL } from '../lib/apiBase';
import { deleteAdminUser, updateUserProfile } from '../lib/userApi';

type UserRole = User['role'];

interface StoredCredential {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  avatar?: string;
}

export interface InitialCredential {
  role: UserRole;
  email: string;
  password: string;
}

interface LoginResult {
  success: boolean;
  user?: User;
  message?: string;
}

interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

interface RegisterResult {
  success: boolean;
  user?: User;
  message?: string;
}

interface CreateAdminInput {
  name: string;
  email: string;
  password: string;
}

interface CreateAdminResult {
  success: boolean;
  admin?: User;
  message?: string;
}

interface DeleteAdminResult {
  success: boolean;
  message?: string;
}

interface UpdateProfileInput {
  name: string;
  email: string;
  avatar?: string;
}

interface UpdateProfileResult {
  success: boolean;
  user?: User;
  message?: string;
}

interface AuthContextValue {
  user: User | null;
  users: User[];
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  createAdminAccount: (input: CreateAdminInput) => Promise<CreateAdminResult>;
  deleteAdminAccount: (adminId: string) => Promise<DeleteAdminResult>;
  updateProfile: (input: UpdateProfileInput) => Promise<UpdateProfileResult>;
}

const ACTIVE_USER_STORAGE_KEY = 'eduflow.auth.active-user';
const CUSTOM_CREDENTIALS_STORAGE_KEY = 'eduflow.auth.custom-credentials';
const PROFILE_OVERRIDES_STORAGE_KEY = 'eduflow.auth.profile-overrides';
const AUTH_API_BASE_URL = API_BASE_URL;

type UserProfileOverride = Pick<User, 'name' | 'email' | 'avatar'>;
type UserProfileOverrides = Record<string, UserProfileOverride>;

const SEED_CREDENTIALS: StoredCredential[] = [
  {
    id: 'seed-admin',
    name: 'Admin User',
    email: 'admin@eduflow.com',
    password: 'Admin@123',
    role: 'Admin',
  },
  {
    id: 'seed-student',
    name: 'Student User',
    email: 'student@eduflow.com',
    password: 'Student@123',
    role: 'Student',
  },
];

export const INITIAL_LOGIN_CREDENTIALS: InitialCredential[] = SEED_CREDENTIALS.map((credential) => ({
  role: credential.role,
  email: credential.email,
  password: credential.password,
}));

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isRole = (value: unknown): value is UserRole => value === 'Admin' || value === 'Student';

const parseUser = (value: unknown): User | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.email !== 'string' ||
    !isRole(record.role)
  ) {
    return null;
  }

  if (record.avatar !== undefined && record.avatar !== null && typeof record.avatar !== 'string') {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    email: record.email,
    role: record.role,
    avatar: typeof record.avatar === 'string' ? record.avatar : undefined,
  };
};

const isStoredCredential = (value: unknown): value is StoredCredential => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.email === 'string' &&
    typeof record.password === 'string' &&
    isRole(record.role) &&
    (record.avatar === undefined || typeof record.avatar === 'string')
  );
};

const isUser = (value: unknown): value is User => {
  return parseUser(value) !== null;
};

const toUser = (credential: StoredCredential): User => ({
  id: credential.id,
  name: credential.name,
  email: credential.email,
  role: credential.role,
  avatar: credential.avatar,
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const extractApiErrorMessage = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.message === 'string') {
    return record.message;
  }

  if (typeof record.detail === 'string') {
    return record.detail;
  }

  if (Array.isArray(record.detail)) {
    const firstDetailWithMessage = record.detail.find((detail) => {
      if (!detail || typeof detail !== 'object') {
        return false;
      }

      const detailRecord = detail as Record<string, unknown>;
      return typeof detailRecord.msg === 'string';
    });

    if (firstDetailWithMessage && typeof (firstDetailWithMessage as Record<string, unknown>).msg === 'string') {
      return (firstDetailWithMessage as Record<string, string>).msg;
    }
  }

  return undefined;
};

const readCustomCredentials = (): StoredCredential[] => {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_CREDENTIALS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isStoredCredential);
  } catch {
    return [];
  }
};

const isUserProfileOverride = (value: unknown): value is UserProfileOverride => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.name === 'string' &&
    typeof record.email === 'string' &&
    (record.avatar === undefined || typeof record.avatar === 'string')
  );
};

const readProfileOverrides = (): UserProfileOverrides => {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PROFILE_OVERRIDES_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.entries(parsed).reduce<UserProfileOverrides>((accumulator, [id, profile]) => {
      if (isUserProfileOverride(profile)) {
        accumulator[id] = profile;
      }
      return accumulator;
    }, {});
  } catch {
    return {};
  }
};

const writeProfileOverrides = (overrides: UserProfileOverrides) => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(PROFILE_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
};

const applyProfileOverrideToCredential = (
  credential: StoredCredential,
  profileOverrides: UserProfileOverrides,
): StoredCredential => {
  const override = profileOverrides[credential.id];
  if (!override) {
    return credential;
  }

  return {
    ...credential,
    name: override.name,
    email: override.email,
    avatar: override.avatar,
  };
};

const applyProfileOverrideToUser = (
  baseUser: User,
  profileOverrides: UserProfileOverrides,
): User => {
  const override = profileOverrides[baseUser.id];
  if (!override) {
    return baseUser;
  }

  return {
    ...baseUser,
    name: override.name,
    email: override.email,
    avatar: override.avatar,
  };
};

const writeCustomCredentials = (credentials: StoredCredential[]) => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(CUSTOM_CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
};

const readActiveUser = (): User | null => {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parseUser(parsed);
  } catch {
    return null;
  }
};

const writeActiveUser = (user: User | null) => {
  if (!canUseStorage()) {
    return;
  }

  if (!user) {
    window.localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(user));
};

export const defaultRouteForRole = (role: UserRole) => (role === 'Admin' ? '/admin' : '/home');

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [profileOverrides, setProfileOverrides] = useState<UserProfileOverrides>(() => readProfileOverrides());
  const [customCredentials, setCustomCredentials] = useState<StoredCredential[]>(() => readCustomCredentials());
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = readActiveUser();
    if (!savedUser) {
      return null;
    }

    return applyProfileOverrideToUser(savedUser, readProfileOverrides());
  });

  const allCredentials = useMemo(() => {
    const seedEmails = new Set(SEED_CREDENTIALS.map((credential) => normalizeEmail(credential.email)));
    const filteredCustomCredentials = customCredentials.filter(
      (credential) => !seedEmails.has(normalizeEmail(credential.email)),
    );
    const hasCustomAdmin = filteredCustomCredentials.some((credential) => credential.role === 'Admin');
    const seedCredentials = SEED_CREDENTIALS.filter(
      (credential) => credential.role !== 'Admin' || !hasCustomAdmin,
    );
    return [...seedCredentials, ...filteredCustomCredentials].map((credential) =>
      applyProfileOverrideToCredential(credential, profileOverrides),
    );
  }, [customCredentials, profileOverrides]);

  const users = useMemo(() => allCredentials.map(toUser), [allCredentials]);

  const validateAccountInput = (name: string, email: string, password: string) => {
    if (!name || !email || !password) {
      return 'All fields are required.';
    }

    if (password.length < 8) {
      return 'Password must be at least 8 characters.';
    }

    const emailExists = allCredentials.some((credential) => normalizeEmail(credential.email) === email);
    if (emailExists) {
      return 'Email is already registered.';
    }

    return null;
  };

  const storeCredential = (credential: StoredCredential) => {
    setCustomCredentials((previousCredentials) => {
      const existingIndex = previousCredentials.findIndex(
        (currentCredential) => currentCredential.id === credential.id || normalizeEmail(currentCredential.email) === normalizeEmail(credential.email),
      );
      const nextCredentials = existingIndex >= 0
        ? previousCredentials.map((currentCredential, index) =>
            index === existingIndex ? credential : currentCredential,
          )
        : [...previousCredentials, credential];
      writeCustomCredentials(nextCredentials);
      return nextCredentials;
    });
  };

  const loginWithDatabase = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: normalizeEmail(email),
          password,
        }),
      });

      const payload = await response.json().catch(() => null);
      const payloadRecord =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
      const payloadMessage = extractApiErrorMessage(payload);

      if (!response.ok) {
        return {
          success: false,
          message: payloadMessage ?? 'Invalid email or password.',
        };
      }

      const user = parseUser(payloadRecord?.user);
      if (payloadRecord?.success !== true || !user) {
        return {
          success: false,
          message: 'Unexpected response from login service.',
        };
      }

      return {
        success: true,
        user,
      };
    } catch {
      return {
        success: false,
        message: 'Cannot reach the login service. Please try again.',
      };
    }
  };

  const registerStudentInDatabase = async (input: RegisterInput): Promise<RegisterResult> => {
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      const payload = await response.json().catch(() => null);
      const payloadRecord =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
      const payloadMessage = extractApiErrorMessage(payload);

      if (!response.ok) {
        return {
          success: false,
          message: payloadMessage ?? 'Unable to create account.',
        };
      }

      const user = parseUser(payloadRecord?.user);
      if (payloadRecord?.success !== true || !user) {
        return {
          success: false,
          message: 'Unexpected response from registration service.',
        };
      }

      return {
        success: true,
        user,
      };
    } catch {
      return {
        success: false,
        message: 'Cannot reach the registration service. Please try again.',
      };
    }
  };

  const registerAdminInDatabase = async (input: CreateAdminInput): Promise<CreateAdminResult> => {
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/api/admin/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      const payload = await response.json().catch(() => null);
      const payloadRecord =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
      const payloadMessage = extractApiErrorMessage(payload);

      if (!response.ok) {
        return {
          success: false,
          message: payloadMessage ?? 'Unable to create admin account.',
        };
      }

      const user = parseUser(payloadRecord?.user);
      if (payloadRecord?.success !== true || !user) {
        return {
          success: false,
          message: 'Unexpected response from admin registration service.',
        };
      }

      return {
        success: true,
        admin: user,
      };
    } catch {
      return {
        success: false,
        message: 'Cannot reach the registration service. Please try again.',
      };
    }
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const databaseResult = await loginWithDatabase(email, password);
    if (!databaseResult.success || !databaseResult.user) {
      return databaseResult;
    }

    const normalizedEmail = normalizeEmail(databaseResult.user.email);
    const existingCredential = allCredentials.find(
      (credential) => normalizeEmail(credential.email) === normalizedEmail,
    );
    storeCredential({
      id: databaseResult.user.id,
      name: databaseResult.user.name,
      email: normalizedEmail,
      password,
      role: databaseResult.user.role,
      avatar: databaseResult.user.avatar,
    });

    const nextUser = existingCredential
      ? {
          ...existingCredential,
          id: databaseResult.user.id,
          name: databaseResult.user.name,
          email: normalizedEmail,
          role: databaseResult.user.role,
          avatar: databaseResult.user.avatar,
        }
      : {
          id: databaseResult.user.id,
          name: databaseResult.user.name,
          email: normalizedEmail,
          role: databaseResult.user.role,
          avatar: databaseResult.user.avatar,
        };
    setUser(nextUser);
    writeActiveUser(nextUser);

    return {
      success: true,
      user: nextUser,
    };
  };

  const logout = () => {
    setUser(null);
    writeActiveUser(null);
  };

  const register = async (input: RegisterInput): Promise<RegisterResult> => {
    const name = input.name.trim();
    const email = normalizeEmail(input.email);
    const password = input.password;

    const validationMessage = validateAccountInput(name, email, password);
    if (validationMessage) {
      return {
        success: false,
        message: validationMessage,
      };
    }

    const databaseResult = await registerStudentInDatabase({ name, email, password });
    if (!databaseResult.success || !databaseResult.user) {
      return databaseResult;
    }

    const newCredential: StoredCredential = {
      id: databaseResult.user.id,
      name: databaseResult.user.name,
      email: normalizeEmail(databaseResult.user.email),
      password,
      role: 'Student',
      avatar: databaseResult.user.avatar,
    };

    storeCredential(newCredential);

    const nextUser = toUser(newCredential);
    setUser(nextUser);
    writeActiveUser(nextUser);

    return {
      success: true,
      user: nextUser,
    };
  };

  const createAdminAccount = async (input: CreateAdminInput): Promise<CreateAdminResult> => {
    if (!user || user.role !== 'Admin') {
      return {
        success: false,
        message: 'Only admins can create admin accounts.',
      };
    }

    const name = input.name.trim();
    const email = normalizeEmail(input.email);
    const password = input.password;

    const validationMessage = validateAccountInput(name, email, password);
    if (validationMessage) {
      return {
        success: false,
        message: validationMessage,
      };
    }

    const databaseResult = await registerAdminInDatabase({ name, email, password });
    if (!databaseResult.success || !databaseResult.admin) {
      return databaseResult;
    }

    const newCredential: StoredCredential = {
      id: databaseResult.admin.id,
      name: databaseResult.admin.name,
      email: normalizeEmail(databaseResult.admin.email),
      password,
      role: 'Admin',
      avatar: databaseResult.admin.avatar,
    };

    storeCredential(newCredential);

    return {
      success: true,
      admin: toUser(newCredential),
    };
  };

  const deleteAdminAccount = async (adminId: string): Promise<DeleteAdminResult> => {
    if (!user || user.role !== 'Admin') {
      return {
        success: false,
        message: 'Only admins can delete admin accounts.',
      };
    }

    if (user.id === adminId) {
      return {
        success: false,
        message: 'You cannot delete your own admin account.',
      };
    }

    if (adminId.startsWith('seed-')) {
      return {
        success: false,
        message: 'Default admin accounts cannot be deleted.',
      };
    }

    const apiResult = await deleteAdminUser(adminId);
    if (!apiResult.success) {
      return {
        success: false,
        message: apiResult.message ?? 'Unable to delete admin account.',
      };
    }

    setCustomCredentials((previousCredentials) => {
      const nextCredentials = previousCredentials.filter((credential) => credential.id !== adminId);
      writeCustomCredentials(nextCredentials);
      return nextCredentials;
    });

    setProfileOverrides((previousOverrides) => {
      if (!previousOverrides[adminId]) {
        return previousOverrides;
      }

      const nextOverrides = { ...previousOverrides };
      delete nextOverrides[adminId];
      writeProfileOverrides(nextOverrides);
      return nextOverrides;
    });

    return {
      success: true,
      message: apiResult.message ?? 'Admin account deleted.',
    };
  };

  const updateProfile = async (input: UpdateProfileInput): Promise<UpdateProfileResult> => {
    if (!user) {
      return {
        success: false,
        message: 'You must be logged in to update your profile.',
      };
    }

    const nextName = input.name.trim();
    const nextEmail = normalizeEmail(input.email);
    const nextAvatar = input.avatar?.trim() || undefined;

    if (!nextName || !nextEmail) {
      return {
        success: false,
        message: 'Name and email are required.',
      };
    }

    const emailInUseByAnotherUser = allCredentials.some(
      (credential) => normalizeEmail(credential.email) === nextEmail && credential.id !== user.id,
    );

    if (emailInUseByAnotherUser) {
      return {
        success: false,
        message: 'Email is already in use by another account.',
      };
    }

    const apiResult = await updateUserProfile(user.id, {
      name: nextName,
      email: nextEmail,
      avatar: nextAvatar ?? null,
    });
    if (!apiResult.success || !apiResult.data) {
      return {
        success: false,
        message: apiResult.message ?? 'Unable to update profile.',
      };
    }

    const nextUser = apiResult.data;

    setUser(nextUser);
    writeActiveUser(nextUser);

    setProfileOverrides((previousOverrides) => {
      const nextOverrides = {
        ...previousOverrides,
        [nextUser.id]: {
          name: nextUser.name,
          email: nextUser.email,
          avatar: nextUser.avatar,
        },
      };
      writeProfileOverrides(nextOverrides);
      return nextOverrides;
    });

    setCustomCredentials((previousCredentials) => {
      const hasMatchingCredential = previousCredentials.some((credential) => credential.id === nextUser.id);
      if (!hasMatchingCredential) {
        return previousCredentials;
      }

      const nextCredentials = previousCredentials.map((credential) =>
        credential.id === nextUser.id
          ? {
              ...credential,
              name: nextUser.name,
              email: nextUser.email,
              avatar: nextUser.avatar,
            }
          : credential,
      );
      writeCustomCredentials(nextCredentials);
      return nextCredentials;
    });

    return {
      success: true,
      user: nextUser,
      message: apiResult.message,
    };
  };

  return (
    <AuthContext.Provider
        value={{
          user,
          users,
          isAuthenticated: Boolean(user),
          login,
          logout,
          register,
          createAdminAccount,
          deleteAdminAccount,
          updateProfile,
        }}
      >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
};
