import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatRelativeTime = (iso: string): string => {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '';
  const deltaSeconds = Math.round((Date.now() - target) / 1000);
  const abs = Math.abs(deltaSeconds);
  if (abs < 45) return 'just now';
  if (abs < 90) return '1m ago';
  if (abs < 60 * 60) return `${Math.round(abs / 60)}m ago`;
  if (abs < 60 * 60 * 24) return `${Math.round(abs / 3600)}h ago`;
  return `${Math.round(abs / 86400)}d ago`;
};

export const truncate = (value: string, max = 48): string =>
  value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
