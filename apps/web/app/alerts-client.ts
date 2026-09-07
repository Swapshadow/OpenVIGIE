'use client';
import { useEffect, useRef } from 'react';

export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) close(); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') { close(); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', keyboard); };
  }, [open, close]);
  return ref;
}

export async function alertsRequest<T = { success: boolean }>(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`/api/${path}`, { method, cache: 'no-store', headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}), signal: AbortSignal.timeout(45000) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Service indisponible.');
  return result;
}
