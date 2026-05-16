'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-40 select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-party text-white shadow-lg shadow-accent-purple/30 hover:shadow-xl hover:shadow-accent-pink/40',
        secondary:
          'bg-surface-raised text-ink border border-border hover:bg-surface-muted',
        outline:
          'bg-transparent text-ink border border-border hover:bg-surface-raised',
        ghost: 'bg-transparent text-ink hover:bg-surface-raised',
        danger: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
        success:
          'bg-success/15 text-success border border-success/40 hover:bg-success/25',
        link: 'text-accent-pink underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-4 text-xs',
        md: 'h-11 px-5',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
