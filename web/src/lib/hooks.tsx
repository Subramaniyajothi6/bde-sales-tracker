import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../api';

/** Load data from the API with loading / error state and a reload function. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // HTTP status of the error (404, 403…), so pages can skip "Try again" when it can't help
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fnRef.current());
      setError(null);
      setErrorStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setErrorStatus(e instanceof ApiError ? e.status : null);
    } finally {
      setLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, deps);
  return { data, setData, error, errorStatus, loading, reload };
}

/** Message from any error, for showing under a form. */
export const errorText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong');

// ---------- Toasts ----------
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<number>();
  const toast = useCallback((m: string) => {
    setMsg(m); setShow(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), 2600);
  }, []);
  // Code outside React (e.g. download below) shows a message by firing this event
  useEffect(() => {
    const on = (e: Event) => toast((e as CustomEvent<string>).detail);
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, [toast]);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className={`toast${show ? ' show' : ''}`} role="status" aria-live="polite">{msg}</div>
    </ToastCtx.Provider>
  );
}

const TOAST_EVENT = 'app-toast';

/**
 * Download a file from the API (same address, so the login cookie goes with it).
 * The file is fetched first, so a server error shows as a message instead of replacing the page.
 */
export async function download(url: string) {
  const say = (msg: string) => window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: msg }));
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
      return say(body?.error ?? `Download failed (${res.status})`);
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'download.xlsx';
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 10000);
  } catch {
    say("Can't reach the server. Check your internet connection and try again.");
  }
}
