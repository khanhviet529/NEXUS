import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** cn() chuẩn shadcn — gộp class có điều kiện + khử trùng lặp tailwind */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
