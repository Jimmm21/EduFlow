import React, { useEffect, useState } from 'react';
import { User, Mail, Save, Upload, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import { uploadUserAvatar } from '../../lib/userApi';

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

export const StudentProfile = () => {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    setIsSaving(true);
    const result = await updateProfile({ name, email, avatar });
    setIsSaving(false);
    if (!result.success) {
      setError(result.message ?? 'Unable to update profile.');
      return;
    }

    setMessage(result.message ?? 'Profile updated successfully.');
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
    <div className="max-w-3xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">My Profile</h1>
        <p className="text-slate-500">Update your student account information.</p>
      </header>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <UserAvatar name={name || user.name} src={avatar || undefined} className="h-16 w-16 border border-slate-200" />
          <div>
            <p className="font-semibold text-slate-900">{user.role}</p>
            <p className="text-sm text-slate-500">Student account settings</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Avatar Image</label>
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
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

          {error ? <p className="text-sm text-red-600 font-medium">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-600 font-medium">{message}</p> : null}

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    </div>
  );
};
