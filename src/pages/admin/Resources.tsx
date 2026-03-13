import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, Mail, Save, Shield, Upload, User, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import { uploadUserAvatar } from '../../lib/userApi';

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

export const AdminProfile = () => {
  const { user, users, updateProfile } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    setName(user.name);
    setEmail(user.email);
    setAvatar(user.avatar ?? '');
    setSelectedFileName('');
  }, [user]);

  if (!user) {
    return null;
  }

  const adminCount = users.filter((account) => account.role === 'Admin').length;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const wantsPasswordChange = Boolean(currentPassword || newPassword || confirmPassword);
    if (wantsPasswordChange) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        setError('Please complete all password fields to change your password.');
        return;
      }
      if (newPassword.length < 8) {
        setError('New password must be at least 8 characters.');
        return;
      }
      if (currentPassword === newPassword) {
        setError('New password must be different from your current password.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('New password and confirmation do not match.');
        return;
      }
    }

    setIsSaving(true);
    const result = await updateProfile({
      name,
      email,
      avatar,
      currentPassword: wantsPasswordChange ? currentPassword : undefined,
      newPassword: wantsPasswordChange ? newPassword : undefined,
    });
    setIsSaving(false);
    if (!result.success) {
      setError(result.message ?? 'Unable to update profile.');
      return;
    }

    setMessage(result.message ?? 'Admin profile updated successfully.');
    if (wantsPasswordChange) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setMessage(null);
    setError(null);

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setError('Avatar image must be 2 MB or smaller.');
      event.target.value = '';
      return;
    }

    setIsUploading(true);
    const uploadResult = await uploadUserAvatar(file);
    setIsUploading(false);
    if (!uploadResult.success || !uploadResult.data) {
      setError(uploadResult.message ?? 'Unable to upload avatar.');
      event.target.value = '';
      return;
    }

    setAvatar(uploadResult.data.url);
    setSelectedFileName(uploadResult.data.fileName);
    event.target.value = '';
  };

  const handleAvatarRemove = () => {
    setAvatar('');
    setSelectedFileName('');
    setMessage(null);
    setError(null);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700">
            <Shield className="h-4 w-4" />
            Admin profile
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Profile Settings</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Update your admin account details and avatar used across the dashboard.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <p className="text-sm text-slate-500">Admin access level</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">Full access</p>
          <p className="mt-1 text-sm text-slate-500">{adminCount} admin accounts currently active</p>
        </div>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="mb-8 flex flex-col gap-5 border-b border-slate-100 pb-8 md:flex-row md:items-center">
          <UserAvatar
            name={name || user.name}
            src={avatar || undefined}
            className="h-20 w-20 border border-slate-200"
            textClassName="text-xl"
          />
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">{name || user.name}</h2>
            <p className="text-sm text-slate-500">{email || user.email}</p>
            <p className="mt-2 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">
              {user.role}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">Full Name</span>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  required
                />
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">Email Address</span>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  required
                />
              </div>
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-bold text-slate-700">Avatar Image</span>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {selectedFileName || (avatar ? 'Uploaded image ready' : 'No image uploaded')}
                  </p>
                  <p className="text-xs text-slate-500">Upload PNG, JPG, or WEBP up to 2 MB.</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700">
                    <Upload className="h-4 w-4" />
                    {isUploading ? 'Uploading...' : 'Upload File'}
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={isUploading} />
                  </label>
                  {avatar ? (
                    <button
                      type="button"
                      onClick={handleAvatarRemove}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                    >
                      <X className="h-4 w-4" />
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-700">Change Password</h3>
              <p className="text-xs text-slate-500">Leave blank to keep your current password.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-600">Current Password</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-10 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-600">New Password</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-10 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                    placeholder="Create a new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-600">Confirm New Password</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-10 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  placeholder="Re-enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
          </div>

          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
          {message ? <p className="text-sm font-medium text-emerald-600">{message}</p> : null}

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </section>
    </div>
  );
};
