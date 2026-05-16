import { cn } from '@/lib/utils';

export const Skeleton = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'rounded-xl bg-gradient-to-r from-surface-raised via-surface-muted to-surface-raised bg-[length:200%_100%] animate-shimmer',
      className,
    )}
    {...props}
  />
);
