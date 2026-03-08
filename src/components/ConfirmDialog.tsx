import React from 'react';

type ConfirmDialogTone = 'danger' | 'primary';

interface ConfirmDialogProps {
  isOpen: boolean;
  badge: string;
  title: string;
  description?: string;
  confirmLabel: string;
  confirmingLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDialog = ({
  isOpen,
  badge,
  title,
  description,
  confirmLabel,
  confirmingLabel = 'Processing...',
  cancelLabel = 'Cancel',
  tone = 'primary',
  isConfirming = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) => {
  if (!isOpen) {
    return null;
  }

  const isDanger = tone === 'danger';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 space-y-2">
          <p className={`text-xs font-bold uppercase tracking-wider ${isDanger ? 'text-red-500' : 'text-indigo-500'}`}>
            {badge}
          </p>
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          {description ? <p className="text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
              isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isConfirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
