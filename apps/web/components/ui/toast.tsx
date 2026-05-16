'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ToastProvider = ToastPrimitive.Provider;

export const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      'fixed bottom-4 left-1/2 z-[100] flex max-h-screen w-full max-w-sm -translate-x-1/2 flex-col-reverse gap-2 p-4 sm:bottom-6 sm:right-6 sm:left-auto sm:translate-x-0 sm:max-w-[420px]',
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border border-border bg-surface px-4 py-3 pr-10 shadow-2xl shadow-black/40 transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-full sm:data-[state=open]:slide-in-from-right-full',
  {
    variants: {
      tone: {
        neutral: 'border-border',
        success: 'border-success/40 bg-success/10',
        warning: 'border-warning/40 bg-warning/10',
        danger: 'border-danger/40 bg-danger/10',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> & VariantProps<typeof toastVariants>
>(({ className, tone, ...props }, ref) => (
  <ToastPrimitive.Root ref={ref} className={cn(toastVariants({ tone }), className)} {...props} />
));
Toast.displayName = ToastPrimitive.Root.displayName;

export const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn('text-sm font-semibold text-ink', className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

export const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn('text-sm text-ink-muted', className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

export const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      'absolute right-2 top-2 rounded-full p-1 text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink',
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" aria-hidden />
    <span className="sr-only">Dismiss</span>
  </ToastPrimitive.Close>
));
ToastClose.displayName = ToastPrimitive.Close.displayName;

export type ToastTone = NonNullable<VariantProps<typeof toastVariants>['tone']>;
