export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail: any = null;
    try { detail = await res.json(); } catch { /* ignore */ }
    // Prefer a human-friendly message; fall back to the error code, then status.
    const msg = detail?.message || detail?.error || `${method} ${url} failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // auth
  me: () => req<any>('GET', '/api/auth/me'),
  login: (username: string, password: string) => req<any>('POST', '/api/auth/login', { username, password }),
  logout: () => req<any>('POST', '/api/auth/logout'),
  changePassword: (current_password: string, new_password: string) =>
    req<any>('POST', '/api/auth/change-password', { current_password, new_password }),
  // users / team
  listUsers: () => req<any>('GET', '/api/users'),
  createUser: (b: unknown) => req<any>('POST', '/api/users', b),
  deleteUser: (id: string) => req<any>('DELETE', `/api/users/${id}`),
  // templates
  listTemplates: () => req<any>('GET', '/api/templates'),
  getTemplate: (id: string) => req<any>('GET', `/api/templates/${id}`),
  createTemplate: (b: unknown) => req<any>('POST', '/api/templates', b),
  updateTemplate: (id: string, b: unknown) => req<any>('PUT', `/api/templates/${id}`, b),
  // sessions
  listSessions: () => req<any>('GET', '/api/sessions'),
  getSession: (id: string) => req<any>('GET', `/api/sessions/${id}`),
  issueSession: (b: unknown) => req<any>('POST', '/api/sessions/issue', b),
  forceEnd: (id: string) => req<any>('POST', `/api/sessions/${id}/force-end`),
  addAnnotation: (id: string, b: unknown) => req<any>('POST', `/api/sessions/${id}/annotations`, b),
  // branding
  getBranding: () => req<any>('GET', '/api/branding'),
  updateBranding: (b: unknown) => req<any>('PUT', '/api/branding', b),
};

export interface Branding {
  productName: string;
  brandColor: string;
  logoUrl: string | null;
  background: 'grid' | 'math' | 'plain';
  welcomeText: string;
  theme: 'light' | 'dark';
}

function hexToRgb(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return '79, 70, 229';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// Apply branding to the document via CSS custom properties + data attributes.
export function applyBranding(b: Partial<Branding>) {
  const root = document.documentElement;
  if (b.brandColor) {
    root.style.setProperty('--brand', b.brandColor);
    root.style.setProperty('--brand-hover', b.brandColor);
    root.style.setProperty('--brand-rgb', hexToRgb(b.brandColor));
    root.style.setProperty('--brand-weak', `rgba(${hexToRgb(b.brandColor)}, 0.10)`);
    root.style.setProperty('--brand-ring', `rgba(${hexToRgb(b.brandColor)}, 0.22)`);
  }
  if (b.background) root.setAttribute('data-bg', b.background);
}

export const takeApi = {
  resolve: (token: string) => req<any>('GET', `/take-api/${token}`),
  branding: (token: string) => req<any>('GET', `/take-api/${token}/branding`),
  start: (token: string) => req<any>('POST', `/take-api/${token}/start`),
  event: (token: string, b: unknown) => req<any>('POST', `/take-api/${token}/events`, b),
  presign: (token: string, b: unknown) => req<any>('POST', `/take-api/${token}/uploads/presign`, b),
  finalize: (token: string, b: unknown) => req<any>('POST', `/take-api/${token}/finalize`, b),
};
