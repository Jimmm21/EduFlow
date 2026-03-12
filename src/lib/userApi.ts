import type { User } from '../types';
import { API_BASE_URL } from './apiBase';

type ProfileUpdateInput = {
  name: string;
  email: string;
  avatar?: string | null;
};

type ApiResult<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

const isRole = (value: unknown): value is User['role'] => value === 'Admin' || value === 'Student';

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

const extractApiMessage = (payload: unknown): string | undefined => {
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

export const uploadUserAvatar = async (file: File): Promise<ApiResult<{ url: string; fileName: string }>> => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/uploads/avatar`, {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        success: false,
        message: extractApiMessage(payload) ?? 'Unable to upload avatar.',
      };
    }

    const asset = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).asset : null;
    if (!asset || typeof asset !== 'object') {
      return {
        success: false,
        message: 'Unexpected response from avatar upload service.',
      };
    }

    const assetRecord = asset as Record<string, unknown>;
    if (typeof assetRecord.url !== 'string' || typeof assetRecord.fileName !== 'string') {
      return {
        success: false,
        message: 'Unexpected response from avatar upload service.',
      };
    }

    return {
      success: true,
      data: {
        url: assetRecord.url,
        fileName: assetRecord.fileName,
      },
    };
  } catch {
    return {
      success: false,
      message: 'Unable to reach the avatar upload service.',
    };
  }
};

export const updateUserProfile = async (
  userId: string,
  input: ProfileUpdateInput,
): Promise<ApiResult<User>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(userId)}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        success: false,
        message: extractApiMessage(payload) ?? 'Unable to update profile.',
      };
    }

    const payloadRecord = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    const user = parseUser(payloadRecord?.user);
    if (!payloadRecord?.success || !user) {
      return {
        success: false,
        message: 'Unexpected response from profile service.',
      };
    }

    return {
      success: true,
      data: user,
      message: extractApiMessage(payload),
    };
  } catch {
    return {
      success: false,
      message: 'Unable to reach the profile service.',
    };
  }
};

export const deleteAdminUser = async (userId: string): Promise<ApiResult<null>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        success: false,
        message: extractApiMessage(payload) ?? 'Unable to delete admin account.',
      };
    }

    const payloadRecord = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    if (payloadRecord?.success !== true) {
      return {
        success: false,
        message: extractApiMessage(payload) ?? 'Unexpected response from delete admin service.',
      };
    }

    return {
      success: true,
      message: extractApiMessage(payload),
      data: null,
    };
  } catch {
    return {
      success: false,
      message: 'Unable to reach the delete admin service.',
    };
  }
};
