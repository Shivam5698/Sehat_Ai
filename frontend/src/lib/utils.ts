export function ensureArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v == null) return [];
  if (typeof v === "string") return [v as unknown as T];
  if (typeof v === "object") return Object.values(v) as unknown as T[];
  return [v as T];
}

export function safeMap<T, R>(v: unknown, fn: (item: T, idx: number) => R): R[] {
  return ensureArray<T>(v).map(fn);
}
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
