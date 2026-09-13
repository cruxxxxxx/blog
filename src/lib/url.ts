const BASE = import.meta.env.BASE_URL;

/** Join a root-relative path onto the configured `base` (safe for project Pages). */
export function href(path = '/'): string {
  return `${BASE.replace(/\/$/, '')}/${path.replace(/^\//, '')}`.replace(/\/{2,}/g, '/') || '/';
}
