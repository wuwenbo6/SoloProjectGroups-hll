import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US")
}

export function formatHex(n: number): string {
  return "0x" + n.toString(16).toUpperCase()
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return val.toFixed(i === 0 ? 0 : 2) + " " + units[i]
}

export function formatTimestamp(ts: number): string {
  const ms = ts > 1e12 ? ts / 1000 : ts
  return new Date(ms).toLocaleString()
}
