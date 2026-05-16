'use client';

import { create } from 'zustand';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  type ToastTone,
} from './toast';

interface ToastEntry {
  id: number;
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
}

interface ToastStore {
  toasts: ToastEntry[];
  push: (toast: Omit<ToastEntry, 'id'>) => number;
  dismiss: (id: number) => void;
}

const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    set({ toasts: [...get().toasts, { id, duration: 4500, ...toast }] });
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (toast: Omit<ToastEntry, 'id'>) => useToastStore.getState().push(toast);

export const Toaster = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <ToastProvider swipeDirection="right" duration={4500}>
      {toasts.map((t) => (
        <Toast
          key={t.id}
          tone={t.tone}
          duration={t.duration}
          onOpenChange={(open) => {
            if (!open) dismiss(t.id);
          }}
        >
          <div className="flex flex-1 flex-col gap-0.5">
            <ToastTitle>{t.title}</ToastTitle>
            {t.description ? <ToastDescription>{t.description}</ToastDescription> : null}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
};
