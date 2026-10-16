/**
 * The only place the web app talks to the server.
 * A future redesign can keep this folder (src/api) as it is and only replace the screens.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>, public details?: unknown) {
    super(message);
  }
}

/** Called when the server says the session has ended, so the app can go back to login. */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

type Query = Record<string, string | number | boolean | undefined | null>;

function url(path: string, query?: Query) {
  const qs = query
    ? Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

export async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown; form?: FormData } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url(path, opts.query), {
      method,
      credentials: 'include',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined)
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet connection and try again.");
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized();
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.fields, data?.details);
  }
  return data as T;
}

export const get = <T>(path: string, query?: Query) => request<T>('GET', path, { query });
export const post = <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} });
export const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, { body });
export const del = <T>(path: string) => request<T>('DELETE', path);
export const postForm = <T>(path: string, form: FormData) => request<T>('POST', path, { form });

/** A link the browser can open directly (downloads, receipt images). */
export const fileUrl = (path: string, query?: Query) => url(path, query);
