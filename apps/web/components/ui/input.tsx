import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-11 w-full rounded-xl border border-border bg-surface/60 px-4 text-base text-ink placeholder:text-ink-subtle transition-colors focus-visible:border-accent-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/40 disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
