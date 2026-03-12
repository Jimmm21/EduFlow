import React, { useMemo, useState } from 'react';
import { Shield, UserPlus, Users, Mail, KeyRound, BadgeCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { cn } from '../../utils';

export const AdminManagement = () => {
  const { user, users, createAdminAccount, deleteAdminAccount } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  const admins = useMemo(
    () =>
      [...users]
        .filter((account) => account.role === 'Admin')
        .sort((left, right) => {
          if (left.id === user?.id) {
            return -1;
          }

          if (right.id === user?.id) {
            return 1;
          }

          return left.name.localeCompare(right.name);
        }),
    [user?.id, users],
  );

  const totalAdmins = admins.length;
  const customAdmins = admins.filter((admin) => !admin.id.startsWith('seed-')).length;
  const totalUsers = users.length;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const result = await createAdminAccount({
      name,
      email,
      password,
    });

    if (!result.success) {
      setError(result.message ?? 'Unable to create admin account.');
      setIsSubmitting(false);
      return;
    }

    setName('');
    setEmail('');
    setPassword('');
    setSuccessMessage(`${result.admin?.name ?? 'Admin'} account created.`);
    setIsSubmitting(false);
  };

  const handleDeleteAdmin = async (adminId: string, adminName: string) => {
    const confirmed = window.confirm(`Delete admin account for ${adminName}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setIsDeletingId(adminId);
    setError(null);
    setSuccessMessage(null);
    setDeleteMessage(null);

    const result = await deleteAdminAccount(adminId);
    setIsDeletingId(null);

    if (!result.success) {
      setError(result.message ?? 'Unable to delete admin account.');
      return;
    }

    setDeleteMessage(result.message ?? `${adminName} account deleted.`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700">
            <Shield className="h-4 w-4" />
            Admin management
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Admin Accounts</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Review who has admin access and create new admin accounts without leaving the dashboard.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm text-slate-500">Total admins</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{totalAdmins}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm text-slate-500">Custom admins</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{customAdmins}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm text-slate-500">All users</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{totalUsers}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Current admins</h2>
              <p className="text-sm text-slate-500">Accounts with full dashboard access.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Users className="h-3.5 w-3.5" />
              {totalAdmins} active
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {admins.map((admin) => {
              const isCurrentUser = admin.id === user?.id;
              const isSeedAdmin = admin.id.startsWith('seed-');
              const canDelete = !isCurrentUser && !isSeedAdmin;

              return (
                <article key={admin.id} className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">{admin.name}</h3>
                      {isCurrentUser ? (
                        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">
                          You
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide',
                          isSeedAdmin ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                        )}
                      >
                        {isSeedAdmin ? 'Default' : 'Created'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{admin.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                      <BadgeCheck className="h-4 w-4 text-indigo-600" />
                      Full admin access
                    </div>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteAdmin(admin.id, admin.name)}
                        disabled={isDeletingId === admin.id}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <Trash2 className="h-4 w-4" />
                        {isDeletingId === admin.id ? 'Deleting...' : 'Delete'}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <UserPlus className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-semibold text-slate-900">Create admin account</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Add another admin for course operations, enrollment approvals, and platform oversight.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Full name</span>
              <div className="relative">
                <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Admin name"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  required
                />
              </div>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Email address</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@eduflow.com"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  required
                />
              </div>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Temporary password</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create a password"
                  minLength={8}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  required
                />
              </div>
            </label>

            {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
            {successMessage ? <p className="text-sm font-medium text-emerald-600">{successMessage}</p> : null}
            {deleteMessage ? <p className="text-sm font-medium text-emerald-600">{deleteMessage}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition-colors hover:bg-indigo-700"
            >
              <UserPlus className="h-4 w-4" />
              {isSubmitting ? 'Creating...' : 'Create Admin'}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
};
